# RepoScope

RepoScope is a small, dependency-free browser app for exploring a GitHub user's public profile and repositories. It is an independent implementation of the asynchronous JavaScript assignment, built with browser `fetch`, `async`/`await`, and the GitHub REST API.

## Run locally

Open `index.html` in a modern browser, enter a GitHub username, and select **Explore profile**. No build step or GitHub sign-in is needed for public data.

## Features

- Loads public profile information and every page of public repositories.
- Refreshes the selected profile every 60 seconds by default; automatic refresh can be switched off.
- Filters repositories by name, description, or language, and sorts by update time, stars, or name.
- Shows clear states for unknown users, empty results, network issues, and GitHub API rate limits.
- Renders API-provided text as text rather than HTML.

GitHub's unauthenticated API has a rate limit. Private repositories are intentionally not requested.
