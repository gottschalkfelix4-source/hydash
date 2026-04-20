#!/bin/bash
set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}HyDash Deployment Script${NC}"

MODE=${1:-compose}

case "$MODE" in
  compose)
    echo -e "${YELLOW}Deploying with Docker Compose...${NC}"
    docker compose down
    docker compose build --no-cache
    docker compose up -d
    echo -e "${GREEN}Deployment complete!${NC}"
    echo "Frontend: http://localhost"
    echo "Backend API: http://localhost:3001"
    echo "PostgreSQL: localhost:5432"
    echo "Redis: localhost:6379"
    ;;

  swarm)
    echo -e "${YELLOW}Deploying with Docker Swarm...${NC}"
    docker build -t hydash-backend:latest ./backend
    docker build -t hydash-frontend:latest ./frontend
    docker stack deploy -c docker-stack.yml hydash
    echo -e "${GREEN}Swarm deployment initiated!${NC}"
    echo "Monitor with: docker service ls"
    ;;

  scale)
    REPLICAS=${2:-2}
    echo -e "${YELLOW}Scaling backend to ${REPLICAS} replicas...${NC}"
    docker service scale hydash_backend=${REPLICAS}
    ;;

  logs)
    SERVICE=${2:-backend}
    echo -e "${YELLOW}Tailing logs for ${SERVICE}...${NC}"
    if docker info --format '{{.Swarm.LocalNodeState}}' 2>/dev/null | grep -q 'active'; then
      docker service logs -f hydash_${SERVICE}
    else
      docker compose logs -f ${SERVICE}
    fi
    ;;

  rollback)
    echo -e "${RED}Rolling back deployment...${NC}"
    docker service rollback hydash_backend
    ;;

  *)
    echo "Usage: $0 {compose|swarm|scale|logs|rollback}"
    echo ""
    echo "Commands:"
    echo "  compose   - Deploy with Docker Compose (development)"
    echo "  swarm     - Deploy with Docker Swarm (production)"
    echo "  scale N   - Scale backend to N replicas"
    echo "  logs SVC  - Tail service logs"
    echo "  rollback  - Rollback to previous version"
    exit 1
    ;;
esac