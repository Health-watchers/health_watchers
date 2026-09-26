# Auto Scaling Policies

Scale API and web workloads on both CPU and request latency.

## API

- CPU target: 65%
- P95 latency target: 750 ms
- Minimum replicas: 2
- Maximum replicas: 10

## Workers

- Queue depth target: 100 jobs per replica
- Scale-down stabilization: 5 minutes
