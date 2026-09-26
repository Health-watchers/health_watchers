# System Design Overview

Health Watchers is split into web, API, Stellar service, worker, database, Redis, and observability layers.

Requests enter through the web/API edge, pass authentication and authorization, then reach domain services. PHI-sensitive records stay in the API/database boundary while operational events flow to monitoring, audit logs, and alerting.
