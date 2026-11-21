#!/bin/sh
# Deploys new commits of main: pulls them into this clone and rebuilds the
# frontend. Does nothing when main has not changed.
#
# The systemd timer aggregator-deploy.timer runs this script once a minute as
# the user deploy (see systemd/ next to this file). The clone fetches over SSH
# with a read-only deploy key, so the server only makes outgoing connections.
#
# The scraper is not restarted: it runs its own loop. Rebuild it by hand after
# scraper changes (see "Common operations" in AGENTS.md).
set -eu

# git reset can replace this file while it runs. A shell reads a function body
# completely before it calls the function, so the old version finishes cleanly.
main() {
    cd "$(dirname "$0")"
    git fetch -q origin main
    [ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ] && return
    git reset -q --hard origin/main
    echo "Deploying $(git log -1 --format='%h %s')"
    # -p deploy: the project name the services have always used, and so the
    # same data volume deploy_pgdata.
    docker compose -p deploy up -d --build frontend
    docker image prune -f
}

main
exit
