# API Versioning Strategy

## Overview

The Health Watchers API implements a comprehensive versioning strategy to ensure backward compatibility while allowing for breaking changes and new features.

## Versioning Approach

We use **URL versioning** with the format `/api/v{version}/` for clear, explicit version identification.

### Supported Versions

- **v1**: Legacy version (deprecated)
  - Base URL: `/api/v1/`
  - Status: Deprecated
  - Sunset Date: 6 months from deprecation notice
  - Features: Basic functionality with limited real-time capabilities

- **v2**: Current version
  - Base URL: `/api/v2/`
  - Status: Current
  - Features: Enhanced responses, real-time Socket.IO events, improved error handling

## Version Lifecycle

### 1. Current Version
- Actively maintained and developed
- Receives new features and bug fixes
- No breaking changes without version increment

### 2. Deprecated Version
- Marked with deprecation headers
- Receives critical security fixes only
- Minimum 6 months notice before sunset
- Clear migration path provided

### 3. Sunset Version
- No longer supported
- Returns 410 Gone status
- Clients must migrate to supported version

## Headers and Negotiation

### Response Headers

All API responses include:
- `API-Version`: Current version being used
- `Deprecation`: "true" for deprecated endpoints
- `Sunset`: Date when version will be removed (RFC 7234)
- `Link`: Successor version URL (RFC 8594)
- `Warning`: Human-readable deprecation message

### Example Response Headers

```http
API-Version: 1.0
Deprecation: true
Sunset: 2025-06-01
Link: </api/v2>; rel="successor-version"
Warning: 299 - "API v1 is deprecated. Please migrate to v2. See /api/versions for details."
```

## Version Information Endpoint

### GET /api/versions

Returns comprehensive version information:

```json
{
  "versions": [
    {
      "version": "v1",
      "status": "deprecated",
      "baseUrl": "/api/v1",
      "releaseDate": "2024-01-01",
      "deprecationDate": "2024-12-01",
      "sunsetDate": "2025-06-01"
    },
    {
      "version": "v2",
      "status": "current",
      "baseUrl": "/api/v2",
      "releaseDate": "2024-12-01"
    }
  ],
  "current": "v2",
  "deprecated": ["v1"],
  "sunset": []
}
```

## Breaking Changes Policy

### What Constitutes a Breaking Change

- Removing or renaming fields in responses
- Changing field types or formats
- Modifying HTTP status codes for existing scenarios
- Changing authentication/authorization requirements
- Altering request/response structure significantly

### Non-Breaking Changes

- Adding new optional fields to responses
- Adding new endpoints
- Adding new optional query parameters
- Improving error messages
- Performance optimizations

## Migration Guidelines

### For API Consumers

1. **Monitor Headers**: Check deprecation headers in responses
2. **Version Endpoint**: Regularly check `/api/versions` for updates
3. **Gradual Migration**: Test new version in staging before production
4. **Fallback Strategy**: Implement version fallback for resilience

### For API Developers

1. **Backward Compatibility**: Maintain for minimum 6 months
2. **Clear Documentation**: Document all breaking changes
3. **Migration Tools**: Provide scripts/tools when possible
4. **Communication**: Announce changes well in advance

## Version-Specific Features

### V1 Features
- Basic CRUD operations
- Standard HTTP responses
- Limited real-time capabilities

### V2 Enhancements
- **Real-time Events**: Socket.IO integration for live updates
- **Enhanced Responses**: Richer metadata and pagination
- **Improved Error Handling**: Consistent error format
- **Better Performance**: Optimized queries and caching
- **New Endpoints**: Additional functionality like check-in

## Implementation Details

### Middleware Stack

```typescript
// V1 routes (deprecated)
app.use('/api/v1', v1DeprecationWarning);
app.use('/api/v1', apiVersionHeader('1.0'));

// V2 routes (current)
app.use('/api/v2', apiVersionHeader('2.0'));
```

### Socket.IO Integration (V2 Only)

Real-time events for appointment status changes:
- `appointment:confirmed`
- `appointment:cancelled`
- `appointment:rescheduled`
- `appointment:patient_arrived`

## Testing Strategy

### Version Compatibility Tests
- Automated tests for each supported version
- Breaking change detection
- Header validation
- Response format verification

### Migration Testing
- Cross-version compatibility
- Data consistency checks
- Performance regression tests

## Monitoring and Analytics

### Metrics Tracked
- Version usage distribution
- Deprecation header acknowledgment
- Migration completion rates
- Error rates by version

### Alerts
- High usage of deprecated versions near sunset
- Breaking change detection in CI/CD
- Version-specific error rate spikes

## Future Considerations

### Version 3 Planning
- GraphQL integration
- Enhanced real-time capabilities
- Microservices architecture
- Advanced caching strategies

This versioning strategy ensures smooth evolution of the API while maintaining reliability for existing integrations.