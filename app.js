const API_ROOT = "https://api.github.com";
const PAGE_SIZE = 100;
const REFRESH_INTERVAL_MS = 60_000;

const form = document.querySelector("#lookup-form");
const usernameInput = document.querySelector("#username");
const lookupButton = document.querySelector("#lookup-button");
const feedback = document.querySelector("#feedback");
const results = document.querySelector("#results");
const profileCard = document.querySelector("#profile-card");
const repoCount = document.querySelector("#repo-count");
const repoFilter = document.querySelector("#repo-filter");
const repoSort = document.querySelector("#repo-sort");
const repoSummary = document.querySelector("#repo-summary");
const repositoryList = document.querySelector("#repository-list");
const autoRefresh = document.querySelector("#auto-refresh");

let currentUsername = "";
let repositories = [];
let activeController = null;
let requestSequence = 0;

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const username = usernameInput.value.trim();
  if (username) {
    loadProfile(username);
  }
});

repoFilter.addEventListener("input", renderRepositories);
repoSort.addEventListener("change", renderRepositories);

autoRefresh.addEventListener("change", () => {
  if (autoRefresh.checked && currentUsername) {
    setFeedback("Automatic refresh is on; results update every minute.");
  } else if (currentUsername) {
    setFeedback("Automatic refresh is off.");
  }
});

window.setInterval(() => {
  if (autoRefresh.checked && currentUsername && !activeController) {
    loadProfile(currentUsername, { silent: true });
  }
}, REFRESH_INTERVAL_MS);

async function loadProfile(username, { silent = false } = {}) {
  if (activeController) {
    activeController.abort();
  }

  const controller = new AbortController();
  activeController = controller;
  const sequence = ++requestSequence;
  const timeoutId = window.setTimeout(() => controller.abort(), 20_000);

  currentUsername = username;
  lookupButton.disabled = true;
  lookupButton.textContent = "Loading…";
  feedback.classList.remove("error");
  setFeedback(silent ? "Refreshing profile and repositories…" : `Looking up @${username}…`);

  if (!silent) {
    results.hidden = true;
    profileCard.replaceChildren();
    repositoryList.replaceChildren();
  }

  try {
    const [profile, allRepositories] = await Promise.all([
      fetchJson(`${API_ROOT}/users/${encodeURIComponent(username)}`, controller.signal),
      fetchAllRepositories(username, controller.signal),
    ]);

    if (sequence !== requestSequence) {
      return;
    }

    repositories = allRepositories;
    renderProfile(profile);
    renderRepositories();
    results.hidden = false;
    setFeedback(`Updated just now · ${formatDateTime(new Date())}`);
  } catch (error) {
    if (sequence !== requestSequence || error.name === "AbortError" && activeController !== controller) {
      return;
    }

    if (error.name === "AbortError") {
      showError("The request timed out. Check your connection and try again.");
    } else {
      showError(error.message);
    }
  } finally {
    window.clearTimeout(timeoutId);
    if (sequence === requestSequence) {
      activeController = null;
      lookupButton.disabled = false;
      lookupButton.textContent = "Explore profile";
    }
  }
}

async function fetchAllRepositories(username, signal) {
  const allRepositories = [];

  for (let page = 1; ; page += 1) {
    const query = new URLSearchParams({
      per_page: String(PAGE_SIZE),
      page: String(page),
      sort: "updated",
      type: "owner",
    });
    const pageRepositories = await fetchJson(
      `${API_ROOT}/users/${encodeURIComponent(username)}/repos?${query}`,
      signal,
    );

    if (!Array.isArray(pageRepositories)) {
      throw new Error("GitHub returned an unexpected repository response.");
    }

    allRepositories.push(...pageRepositories);
    if (pageRepositories.length < PAGE_SIZE) {
      return allRepositories;
    }
  }
}

async function fetchJson(url, signal) {
  let response;
  try {
    response = await fetch(url, {
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      signal,
    });
  } catch (error) {
    if (error.name === "AbortError") {
      throw error;
    }
    throw new Error("Could not reach GitHub. Check your internet connection and try again.");
  }

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error("That GitHub username was not found. Check the spelling and try again.");
    }
    if (response.status === 403 || response.status === 429) {
      throw new Error("GitHub’s unauthenticated API limit was reached. Wait a little and try again.");
    }
    const detail = data && typeof data.message === "string" ? ` ${data.message}` : "";
    throw new Error(`GitHub request failed (${response.status}).${detail}`);
  }

  return data;
}

function renderProfile(profile) {
  profileCard.replaceChildren();

  const avatar = document.createElement("img");
  avatar.className = "avatar";
  avatar.src = profile.avatar_url;
  avatar.alt = `${profile.login}'s avatar`;
  avatar.loading = "lazy";

  const info = document.createElement("div");
  info.className = "profile-info";
  const name = document.createElement("h2");
  name.className = "profile-name";
  name.textContent = profile.name || profile.login;

  const login = externalLink(profile.html_url, `@${profile.login}`);
  login.className = "profile-login";

  const bio = document.createElement("p");
  bio.className = "profile-bio";
  bio.textContent = profile.bio || "No bio has been added to this profile.";

  const meta = document.createElement("div");
  meta.className = "profile-meta";
  addMetaText(meta, profile.location);
  addMetaLink(meta, profile.blog, normalizeWebsite(profile.blog));
  addMetaText(meta, profile.company);

  info.append(name, login, bio, meta);

  const stats = document.createElement("div");
  stats.className = "profile-stats";
  stats.append(
    makeStat(profile.public_repos, "repositories"),
    makeStat(profile.followers, "followers"),
    makeStat(profile.following, "following"),
  );

  profileCard.append(avatar, info, stats);
}

function renderRepositories() {
  const search = repoFilter.value.trim().toLowerCase();
  const sort = repoSort.value;
  const visibleRepositories = repositories
    .filter((repo) => {
      const searchable = `${repo.name} ${repo.description || ""} ${repo.language || ""}`.toLowerCase();
      return searchable.includes(search);
    })
    .sort((a, b) => {
      if (sort === "stars") {
        return b.stargazers_count - a.stargazers_count || a.name.localeCompare(b.name);
      }
      if (sort === "name") {
        return a.name.localeCompare(b.name);
      }
      return new Date(b.updated_at) - new Date(a.updated_at);
    });

  repoCount.textContent = String(repositories.length);
  repoSummary.textContent = search
    ? `Showing ${visibleRepositories.length} of ${repositories.length} public repositories`
    : `${repositories.length} public ${repositories.length === 1 ? "repository" : "repositories"} · sorted by ${sortLabel(sort)}`;

  repositoryList.replaceChildren();
  if (visibleRepositories.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = search
      ? "No repositories match that filter."
      : "This profile has no public repositories yet.";
    repositoryList.append(empty);
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const repo of visibleRepositories) {
    fragment.append(makeRepositoryCard(repo));
  }
  repositoryList.append(fragment);
}

function makeRepositoryCard(repo) {
  const card = document.createElement("article");
  card.className = "repo-card";

  const titleRow = document.createElement("div");
  titleRow.className = "repo-title-row";
  const name = externalLink(repo.html_url, repo.name);
  name.className = "repo-name";

  const visibility = document.createElement("span");
  visibility.className = "repo-visibility";
  visibility.textContent = repo.fork ? "Fork" : "Public";
  titleRow.append(name, visibility);

  const description = document.createElement("p");
  description.className = "repo-description";
  description.textContent = repo.description || "No description provided.";

  const meta = document.createElement("div");
  meta.className = "repo-meta";
  if (repo.language) {
    const language = document.createElement("span");
    language.className = "repo-language";
    const dot = document.createElement("span");
    dot.className = "language-dot";
    dot.setAttribute("aria-hidden", "true");
    language.append(dot, document.createTextNode(repo.language));
    meta.append(language);
  }
  meta.append(
    makeMetaItem("★", formatNumber(repo.stargazers_count), "stars"),
    makeMetaItem("⑂", formatNumber(repo.forks_count), "forks"),
    makeMetaItem("↻", formatRelativeDate(repo.updated_at), "updated"),
  );

  card.append(titleRow, description, meta);
  return card;
}

function makeStat(value, label) {
  const stat = document.createElement("div");
  stat.className = "stat";
  const number = document.createElement("strong");
  number.textContent = formatNumber(value);
  const caption = document.createElement("span");
  caption.textContent = label;
  stat.append(number, caption);
  return stat;
}

function makeMetaItem(icon, value, label) {
  const item = document.createElement("span");
  item.textContent = `${icon} ${value} ${label}`;
  return item;
}

function addMetaText(parent, value) {
  if (!value) {
    return;
  }
  const item = document.createElement("span");
  item.textContent = value;
  parent.append(item);
}

function addMetaLink(parent, label, url) {
  if (!label || !url) {
    return;
  }
  parent.append(externalLink(url, label));
}

function externalLink(url, label) {
  const link = document.createElement("a");
  link.href = url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = label;
  return link;
}

function normalizeWebsite(value) {
  if (!value) {
    return "";
  }
  const candidate = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  try {
    const url = new URL(candidate);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : "";
  } catch {
    return "";
  }
}

function formatNumber(value) {
  return new Intl.NumberFormat().format(Number(value) || 0);
}

function formatRelativeDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "unknown";
  }
  const days = Math.max(0, Math.floor((Date.now() - date.getTime()) / 86_400_000));
  if (days === 0) {
    return "today";
  }
  if (days === 1) {
    return "1 day ago";
  }
  if (days < 30) {
    return `${days} days ago`;
  }
  const months = Math.floor(days / 30);
  if (months < 12) {
    return `${months} ${months === 1 ? "month" : "months"} ago`;
  }
  const years = Math.floor(months / 12);
  return `${years} ${years === 1 ? "year" : "years"} ago`;
}

function formatDateTime(date) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function sortLabel(sort) {
  return {
    updated: "recent activity",
    stars: "stars",
    name: "name",
  }[sort];
}

function showError(message) {
  feedback.classList.add("error");
  setFeedback(message);
}

function setFeedback(message) {
  feedback.textContent = message;
}
