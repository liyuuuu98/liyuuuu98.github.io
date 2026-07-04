(function () {
	'use strict';

	var GITHUB_REPO_RE = /^https:\/\/github\.com\/([^/]+\/[^/?#]+)/i;
	var CACHE_TTL_MS = 24 * 60 * 60 * 1000;

	function parseRepo(url) {
		var match = url.match(GITHUB_REPO_RE);
		return match ? match[1] : null;
	}

	function formatStars(count) {
		if (count >= 1000) {
			return (count / 1000).toFixed(count >= 10000 ? 0 : 1).replace(/\.0$/, '') + 'k';
		}
		return String(count);
	}

	function parseStarMessage(message) {
		var normalized = String(message).trim().toLowerCase();
		if (normalized.slice(-1) === 'k') {
			return Math.round(parseFloat(normalized) * 1000);
		}
		return parseInt(normalized.replace(/,/g, ''), 10);
	}

	function readCache(repo) {
		try {
			var raw = localStorage.getItem('gh-stars-' + repo);
			if (!raw) {
				return null;
			}
			var cached = JSON.parse(raw);
			if (Date.now() - cached.ts < CACHE_TTL_MS) {
				return cached.count;
			}
		} catch (error) {
			return null;
		}
		return null;
	}

	function writeCache(repo, count) {
		try {
			localStorage.setItem('gh-stars-' + repo, JSON.stringify({
				count: count,
				ts: Date.now()
			}));
		} catch (error) {
			// Ignore storage failures.
		}
	}

	function fetchStarsFromShields(repo) {
		return fetch('https://img.shields.io/github/stars/' + encodeURIComponent(repo) + '.json')
			.then(function (response) {
				if (!response.ok) {
					throw new Error('shields.io request failed');
				}
				return response.json();
			})
			.then(function (data) {
				var count = parseStarMessage(data.message);
				if (!Number.isFinite(count)) {
					throw new Error('Invalid star count');
				}
				return count;
			});
	}

	function fetchStarsFromGitHub(repo) {
		return fetch('https://api.github.com/repos/' + encodeURIComponent(repo), {
			headers: {
				Accept: 'application/vnd.github+json'
			}
		}).then(function (response) {
			if (!response.ok) {
				throw new Error('GitHub API request failed');
			}
			return response.json();
		}).then(function (data) {
			return data.stargazers_count;
		});
	}

	function fetchStars(repo) {
		var cached = readCache(repo);
		if (cached !== null) {
			return Promise.resolve(cached);
		}

		return fetchStarsFromShields(repo).catch(function () {
			return fetchStarsFromGitHub(repo);
		}).then(function (count) {
			writeCache(repo, count);
			return count;
		});
	}

	function renderStars(links, count) {
		var label = formatStars(count);
		links.forEach(function (link) {
			link.innerHTML = '[Code <span class="github-stars">\u2605 ' + label + '</span>]';
			link.title = count.toLocaleString() + ' GitHub stars';
			link.setAttribute('aria-label', 'Code (' + count.toLocaleString() + ' GitHub stars)');
		});
	}

	function init() {
		var links = Array.prototype.slice.call(
			document.querySelectorAll('a[href*="github.com"]')
		).filter(function (link) {
			return link.textContent.trim() === '[Code]';
		});

		var linksByRepo = new Map();
		links.forEach(function (link) {
			var repo = parseRepo(link.href);
			if (!repo) {
				return;
			}
			if (!linksByRepo.has(repo)) {
				linksByRepo.set(repo, []);
			}
			linksByRepo.get(repo).push(link);
		});

		linksByRepo.forEach(function (repoLinks, repo) {
			fetchStars(repo).then(function (count) {
				renderStars(repoLinks, count);
			}).catch(function () {
				// Leave the page unchanged if all providers are unavailable.
			});
		});
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', init);
	} else {
		init();
	}
})();
