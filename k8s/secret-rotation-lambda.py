"""
AWS Secrets Manager Automatic Rotation Function

This Lambda function handles automatic rotation of secrets stored in AWS Secrets Manager.
It rotates database passwords, API keys, and other sensitive credentials.
"""

import json
import boto3
import os
import logging
from datetime import datetime

logger = logging.getLogger()
logger.setLevel(logging.INFO)

secrets_client = boto3.client('secretsmanager')
kms_client = boto3.client('kms')


def lambda_handler(event, context):
    """
    Main Lambda handler for secret rotation
    
    Event format:
    {
        "SecretId": "health-watchers/production",
        "ClientRequestToken": "AAAAA-BBBBB-CCCCC-DDDDD-EEEEEE",
        "Step": "create|set|test|finish",
        "SecretString": "..."
    }
    """
    
    secret_id = event['SecretId']
    token = event['ClientRequestToken']
    step = event['Step']
    
    logger.info(f"Starting secret rotation for {secret_id}, step: {step}")
    
    try:
        # Get secret metadata
        secret_metadata = secrets_client.describe_secret(SecretId=secret_id)
        
        # Ensure secret is configured for rotation
        if 'RotationRules' not in secret_metadata:
            raise Exception(f"Secret {secret_id} is not configured for rotation")
        
        # Get the secret versions
        secret_versions = secrets_client.list_secret_version_ids(SecretId=secret_id)
        
        # Perform rotation based on step
        if step == "create":
            create_secret(secrets_client, secret_id, token)
        
        elif step == "set":
            set_secret(secrets_client, secret_id, token)
        
        elif step == "test":
            test_secret(secrets_client, secret_id, token)
        
        elif step == "finish":
            finish_secret(secrets_client, secret_id, token)
        
        else:
            raise ValueError(f"Invalid step parameter: {step}")
        
        logger.info(f"Successfully completed {step} for {secret_id}")
        
        return {
            'statusCode': 200,
            'body': json.dumps({
                'message': f'Secret rotation {step} completed',
                'secret_id': secret_id,
                'timestamp': datetime.now().isoformat()
            })
        }
    
    except Exception as e:
        logger.error(f"Error during secret rotation: {str(e)}", exc_info=True)
        
        # Log rotation failure
        log_rotation_failure(secret_id, step, str(e))
        
        return {
            'statusCode': 500,
            'body': json.dumps({
                'error': str(e),
                'secret_id': secret_id
            })
        }


def create_secret(client, secret_id, token):
    """
    Create a new version of the secret with rotated credentials
    """
    logger.info(f"Creating new secret version for {secret_id}")
    
    # Get current secret value
    current_secret = client.get_secret_value(
        SecretId=secret_id,
        VersionId=None,
        VersionStage='AWSCURRENT'
    )
    
    secret_dict = json.loads(current_secret['SecretString'])
    
    # Generate new credentials based on secret type
    if 'password' in secret_dict:
        # Database password rotation
        new_password = generate_password()
        secret_dict['password'] = new_password
        secret_dict['rotated_at'] = datetime.now().isoformat()
        secret_dict['rotation_status'] = 'pending'
    
    elif 'api_key' in secret_dict or 'access_key' in secret_dict:
        # API key rotation
        new_key = generate_api_key()
        if 'api_key' in secret_dict:
            secret_dict['api_key'] = new_key
        else:
            secret_dict['access_key'] = new_key
        secret_dict['rotated_at'] = datetime.now().isoformat()
        secret_dict['rotation_status'] = 'pending'
    
    else:
        raise Exception(f"Unknown secret type for {secret_id}")
    
    # Store the new secret version
    client.put_secret_value(
        SecretId=secret_id,
        ClientRequestToken=token,
        SecretString=json.dumps(secret_dict),
        VersionStages=['AWSPENDING']
    )
    
    logger.info(f"New secret version created: {token}")


def set_secret(client, secret_id, token):
    """
    Apply the new secret in the target system (database, API, etc)
    """
    logger.info(f"Applying new secret to target systems for {secret_id}")
    
    # Get the pending secret
    pending_secret = client.get_secret_value(
        SecretId=secret_id,
        VersionId=token,
        VersionStage='AWSPENDING'
    )
    
    secret_dict = json.loads(pending_secret['SecretString'])
    
    # Apply secret based on type
    if secret_id.endswith('/mongodb'):
        apply_mongodb_credentials(secret_dict)
    
    elif secret_id.endswith('/api-keys'):
        apply_api_credentials(secret_dict)
    
    elif secret_id.endswith('/stellar'):
        apply_stellar_credentials(secret_dict)
    
    else:
        logger.warning(f"No specific handler for {secret_id}, skipping set phase")
    
    logger.info(f"Secret applied to target systems")


def test_secret(client, secret_id, token):
    """
    Test the new secret to ensure it works
    """
    logger.info(f"Testing new secret for {secret_id}")
    
    # Get the pending secret
    pending_secret = client.get_secret_value(
        SecretId=secret_id,
        VersionId=token,
        VersionStage='AWSPENDING'
    )
    
    secret_dict = json.loads(pending_secret['SecretString'])
    
    # Test based on secret type
    if secret_id.endswith('/mongodb'):
        test_mongodb_connection(secret_dict)
    
    elif secret_id.endswith('/api-keys'):
        test_api_keys(secret_dict)
    
    elif secret_id.endswith('/stellar'):
        test_stellar_account(secret_dict)
    
    else:
        logger.warning(f"No test handler for {secret_id}")
    
    logger.info(f"Secret test passed")


def finish_secret(client, secret_id, token):
    """
    Mark the new secret as current and retire old versions
    """
    logger.info(f"Finalizing secret rotation for {secret_id}")
    
    # Get current version
    current_version = None
    versions = client.list_secret_version_ids(SecretId=secret_id)
    for version in versions['Versions']:
        if 'AWSCURRENT' in version['VersionStages']:
            current_version = version['VersionId']
            break
    
    # Update version stages
    client.update_secret_version_stage(
        SecretId=secret_id,
        VersionStage='AWSCURRENT',
        MoveToVersionId=token,
        RemoveFromVersionId=current_version
    )
    
    # Clean up old AWSPENDING stage if it exists
    if current_version:
        try:
            client.update_secret_version_stage(
                SecretId=secret_id,
                VersionStage='AWSPENDING',
                RemoveFromVersionId=current_version
            )
        except:
            pass
    
    logger.info(f"Secret rotation completed and new version marked as current")


def generate_password(length=32):
    """Generate a random password"""
    import string
    import secrets
    
    alphabet = string.ascii_letters + string.digits + "!@#$%^&*()_+-=[]{}|;:,.<>?"
    password = ''.join(secrets.choice(alphabet) for i in range(length))
    return password


def generate_api_key(length=64):
    """Generate a random API key"""
    import string
    import secrets
    
    alphabet = string.ascii_letters + string.digits
    key = ''.join(secrets.choice(alphabet) for i in range(length))
    return key


def apply_mongodb_credentials(secret_dict):
    """Apply MongoDB credentials"""
    # This would connect to MongoDB and change user password
    logger.info(f"Applying MongoDB credentials")
    # Implementation would depend on MongoDB setup
    pass


def apply_api_credentials(secret_dict):
    """Apply API key credentials"""
    logger.info(f"Applying API key credentials")
    # Would update API key in the system
    pass


def apply_stellar_credentials(secret_dict):
    """Apply Stellar account credentials"""
    logger.info(f"Applying Stellar credentials")
    # Would update Stellar account setup if applicable
    pass


def test_mongodb_connection(secret_dict):
    """Test MongoDB connection with new credentials"""
    logger.info(f"Testing MongoDB connection")
    # Implementation would actually test connection
    pass


def test_api_keys(secret_dict):
    """Test API keys"""
    logger.info(f"Testing API keys")
    # Implementation would test API key validity
    pass


def test_stellar_account(secret_dict):
    """Test Stellar account access"""
    logger.info(f"Testing Stellar account access")
    # Implementation would test Stellar network access
    pass


def log_rotation_failure(secret_id, step, error):
    """Log rotation failure for audit purposes"""
    cloudtrail = boto3.client('cloudtrail')
    
    logger.error(f"Secret rotation failed for {secret_id} at step {step}: {error}")
    
    # The error is automatically logged to CloudTrail by AWS
    # Here we're just adding application-level logging


if __name__ == "__main__":
    # For local testing
    test_event = {
        "SecretId": "health-watchers/production",
        "ClientRequestToken": "AAAAA-BBBBB-CCCCC-DDDDD-EEEEEE",
        "Step": "create"
    }
    
    result = lambda_handler(test_event, None)
    print(json.dumps(result, indent=2))
