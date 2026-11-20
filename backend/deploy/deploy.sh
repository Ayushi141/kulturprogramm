#!/bin/sh
# Updates the server's clone to the newest main and rebuilds the frontend.
#
# GitHub Actions (.github/workflows/deploy.yml) runs this script over SSH after
# every push to main. The deploy key in ~/.ssh/authorized_keys forces this
# command, so that key can do nothing else on the server.
#
# The scraper is not restarted: it runs its own loop. Rebuild it by hand after
# scraper changes (see "Common operations" in AGENTS.md).
set -eu

# git pull can replace this file while it runs. A shell reads a function body
# completely before it calls the function, so the old version finishes cleanly.
main() {
    cd "$(dirname "$0")"
    git pull --ff-only origin main
    # -p deploy: the same project name (and so the same data volume
    # deploy_pgdata) as when Compose is started by hand from this directory.
    docker compose -p deploy up -d --build frontend
    docker image prune -f
}

main
exit
