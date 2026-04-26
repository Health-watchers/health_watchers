# Requirements Document

## Introduction

The Data Anonymization feature provides a robust service for removing personally identifiable information (PII) from patient data before it is sent to external AI services or exported for research purposes. This system ensures HIPAA compliance and protects patient privacy through multiple levels of anonymization, comprehensive audit logging, and reversible pseudonymization capabilities.

## Glossary

- **Anonymization_Service**: The core service responsible for removing or transforming PII from patient data
- **PII**: Personally Identifiable Information - any data that can identify a specific individual
- **De-identification**: The process of removing direct identifiers from data (Level 1)
- **Pseudonymization**: The process of replacing identifiers with consistent pseudonyms (Level 2)
- **Aggregation**: The process of combining data into statistical summaries with no individual records (Level 3)
- **AI_Service**: External AI service (Gemini) that processes clinical data
- **Research_Export_API**: API endpoint for exporting anonymized datasets for research
- **Audit_Logger**: System component that records all anonymization operations
- **Clinical_Notes**: Text-based medical documentation containing patient information
- **IRB**: Institutional Review Board - ethics committee that approves research

## Requirements

### Requirement 1: Anonymization Service Core

**User Story:** As a system administrator, I want a centralized anonymization service, so that all PII removal follows consistent rules across the application.

#### Acceptance Criteria

1. THE Anonymization_Service SHALL be implemented in packages/anonymize/index.ts
2. WHEN processing patient data, THE Anonymization_Service SHALL transform firstName and lastName into Patient_[hash] format
3. WHEN processing patient data, THE Anonymization_Service SHALL convert dateOfBirth into age ranges (e.g., '45-50 years')
4. WHEN processing patient data, THE Anonymization_Service SHALL replace contactNumber with [REDACTED]
5. WHEN processing patient data, THE Anonymization_Service SHALL extract only city/region from address and remove street information
6. WHEN processing patient data, THE Anonymization_Service SHALL replace email with [REDACTED]
7. WHEN processing patient data, THE Anonymization_Service SHALL generate consistent anonymized IDs for systemId within a session

### Requirement 2: Multi-Level Anonymization

**User Story:** As a compliance officer, I want different levels of anonymization, so that I can apply appropriate privacy protection based on the use case.

#### Acceptance Criteria

1. THE Anonymization_Service SHALL support Level 1 (De-identification) that removes direct identifiers
2. THE Anonymization_Service SHALL support Level 2 (Pseudonymization) that replaces identifiers with consistent pseudonyms
3. THE Anonymization_Service SHALL support Level 3 (Aggregation) that provides only aggregate statistics without individual records
4. WHEN Level 2 is applied, THE Anonymization_Service SHALL maintain consistent pseudonyms for the same patient across multiple operations within a session
5. WHEN Level 3 is applied, THE Anonymization_Service SHALL ensure no individual patient records are identifiable in the output

### Requirement 3: AI Service Integration

**User Story:** As a healthcare provider, I want patient data automatically anonymized before AI processing, so that I can use AI assistance while maintaining patient privacy.

#### Acceptance Criteria

1. WHEN sending data to AI_Service, THE system SHALL apply Level 1 anonymization to all patient data
2. WHEN processing Clinical_Notes for AI_Service, THE Anonymization_Service SHALL detect and remove names using pattern matching
3. WHEN processing Clinical_Notes for AI_Service, THE Anonymization_Service SHALL detect and remove phone numbers using pattern matching
4. WHEN processing Clinical_Notes for AI_Service, THE Anonymization_Service SHALL detect and remove addresses using pattern matching
5. WHEN processing Clinical_Notes for AI_Service, THE Anonymization_Service SHALL detect and remove email addresses using pattern matching
6. WHEN processing Clinical_Notes for AI_Service, THE Anonymization_Service SHALL replace patient name references with 'the patient'
7. WHEN processing Clinical_Notes for AI_Service, THE Anonymization_Service SHALL replace absolute dates with relative time expressions (e.g., '3 months ago')

### Requirement 4: Research Data Export

**User Story:** As a researcher, I want to export anonymized patient data for research, so that I can conduct studies while protecting patient privacy.

#### Acceptance Criteria

1. THE Research_Export_API SHALL be accessible at GET /api/v1/research/export
2. WHEN a user requests research export, THE system SHALL verify the user has SUPER_ADMIN role
3. WHEN exporting for research, THE Research_Export_API SHALL apply Level 3 anonymization (aggregated statistics only)
4. WHEN a research export is requested, THE system SHALL require an IRB approval flag in the request
5. IF the IRB approval flag is missing or false, THEN THE Research_Export_API SHALL reject the request with an appropriate error

### Requirement 5: Reversible Pseudonymization

**User Story:** As a system administrator, I want pseudonymization to be reversible, so that authorized users can re-identify data when necessary for patient care.

#### Acceptance Criteria

1. WHEN Level 2 pseudonymization is applied, THE Anonymization_Service SHALL store a reversible mapping between original identifiers and pseudonyms
2. WHEN a de-pseudonymization request is made, THE Anonymization_Service SHALL verify the requester has appropriate authorization
3. WHEN a valid de-pseudonymization request is made, THE Anonymization_Service SHALL restore original identifiers from pseudonyms
4. THE Anonymization_Service SHALL ensure pseudonym mappings are stored securely and encrypted

### Requirement 6: Anonymization Audit Trail

**User Story:** As a compliance officer, I want all anonymization operations logged, so that I can audit privacy protection measures and ensure regulatory compliance.

#### Acceptance Criteria

1. WHEN any anonymization operation is performed, THE Audit_Logger SHALL record what data was anonymized
2. WHEN any anonymization operation is performed, THE Audit_Logger SHALL record the purpose (AI, research, export)
3. WHEN any anonymization operation is performed, THE Audit_Logger SHALL record who requested the operation
4. WHEN any anonymization operation is performed, THE Audit_Logger SHALL record the anonymization level applied
5. WHEN any anonymization operation is performed, THE Audit_Logger SHALL record a timestamp of the operation

### Requirement 7: Clinical Meaning Preservation

**User Story:** As a healthcare provider, I want anonymized clinical notes to retain their medical meaning, so that AI analysis and research remain clinically valid.

#### Acceptance Criteria

1. WHEN anonymizing Clinical_Notes, THE Anonymization_Service SHALL preserve medical terminology and clinical context
2. WHEN anonymizing Clinical_Notes, THE Anonymization_Service SHALL preserve temporal relationships between events
3. WHEN anonymizing Clinical_Notes, THE Anonymization_Service SHALL preserve symptom descriptions and medical findings
4. WHEN anonymizing Clinical_Notes, THE Anonymization_Service SHALL preserve treatment information and medication details

### Requirement 8: PII Detection Accuracy

**User Story:** As a security officer, I want comprehensive PII detection, so that no personally identifiable information leaks through the anonymization process.

#### Acceptance Criteria

1. THE Anonymization_Service SHALL use regex patterns to detect names in various formats (First Last, Last First, etc.)
2. THE Anonymization_Service SHALL use regex patterns to detect phone numbers in various formats (US and international)
3. THE Anonymization_Service SHALL use regex patterns to detect street addresses with house numbers and street names
4. THE Anonymization_Service SHALL use regex patterns to detect email addresses in standard formats
5. WHEN PII is detected in Clinical_Notes, THE Anonymization_Service SHALL replace it while maintaining text readability
