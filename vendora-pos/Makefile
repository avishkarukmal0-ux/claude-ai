.PHONY: dev down seed test logs shell db

dev:
	docker-compose up -d

down:
	docker-compose down

seed:
	docker-compose exec backend node src/utils/seedData.js

test:
	docker-compose exec backend npm test

logs:
	docker-compose logs -f backend

shell:
	docker-compose exec backend sh

db:
	docker-compose exec mongo mongosh vendora-dev
