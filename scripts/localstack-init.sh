#!/bin/bash
set -e

echo "Initializing Localstack resources..."

# DynamoDB — Appointments table with GSI byInsured
awslocal dynamodb create-table \
  --table-name Appointments \
  --attribute-definitions \
    AttributeName=appointmentUuid,AttributeType=S \
    AttributeName=insuredId,AttributeType=S \
  --key-schema \
    AttributeName=appointmentUuid,KeyType=HASH \
  --global-secondary-indexes '[
    {
      "IndexName": "byInsured",
      "KeySchema": [{"AttributeName": "insuredId", "KeyType": "HASH"}],
      "Projection": {"ProjectionType": "ALL"},
      "ProvisionedThroughput": {"ReadCapacityUnits": 5, "WriteCapacityUnits": 5}
    }
  ]' \
  --billing-mode PAY_PER_REQUEST

# SNS topic
awslocal sns create-topic --name appointmentTopic

# SQS queues (main + DLQs)
awslocal sqs create-queue --queue-name appointments-pe-dlq
awslocal sqs create-queue --queue-name appointments-cl-dlq
awslocal sqs create-queue --queue-name appointments-confirmaciones-dlq

PE_DLQ_ARN=$(awslocal sqs get-queue-attributes \
  --queue-url http://localhost:4566/000000000000/appointments-pe-dlq \
  --attribute-names QueueArn \
  --query Attributes.QueueArn --output text)

CL_DLQ_ARN=$(awslocal sqs get-queue-attributes \
  --queue-url http://localhost:4566/000000000000/appointments-cl-dlq \
  --attribute-names QueueArn \
  --query Attributes.QueueArn --output text)

CONF_DLQ_ARN=$(awslocal sqs get-queue-attributes \
  --queue-url http://localhost:4566/000000000000/appointments-confirmaciones-dlq \
  --attribute-names QueueArn \
  --query Attributes.QueueArn --output text)

awslocal sqs create-queue --queue-name appointments-pe \
  --attributes "{\"RedrivePolicy\":\"{\\\"deadLetterTargetArn\\\":\\\"$PE_DLQ_ARN\\\",\\\"maxReceiveCount\\\":\\\"3\\\"}\"}"

awslocal sqs create-queue --queue-name appointments-cl \
  --attributes "{\"RedrivePolicy\":\"{\\\"deadLetterTargetArn\\\":\\\"$CL_DLQ_ARN\\\",\\\"maxReceiveCount\\\":\\\"3\\\"}\"}"

awslocal sqs create-queue --queue-name appointments-confirmaciones \
  --attributes "{\"RedrivePolicy\":\"{\\\"deadLetterTargetArn\\\":\\\"$CONF_DLQ_ARN\\\",\\\"maxReceiveCount\\\":\\\"3\\\"}\"}"

# SNS → SQS subscriptions with country filter
TOPIC_ARN=$(awslocal sns list-topics --query 'Topics[0].TopicArn' --output text)
PE_QUEUE_ARN=$(awslocal sqs get-queue-attributes \
  --queue-url http://localhost:4566/000000000000/appointments-pe \
  --attribute-names QueueArn --query Attributes.QueueArn --output text)
CL_QUEUE_ARN=$(awslocal sqs get-queue-attributes \
  --queue-url http://localhost:4566/000000000000/appointments-cl \
  --attribute-names QueueArn --query Attributes.QueueArn --output text)

awslocal sns subscribe \
  --topic-arn "$TOPIC_ARN" \
  --protocol sqs \
  --notification-endpoint "$PE_QUEUE_ARN" \
  --attributes '{"FilterPolicy":"{\"countryISO\":[\"PE\"]}","RawMessageDelivery":"true"}'

awslocal sns subscribe \
  --topic-arn "$TOPIC_ARN" \
  --protocol sqs \
  --notification-endpoint "$CL_QUEUE_ARN" \
  --attributes '{"FilterPolicy":"{\"countryISO\":[\"CL\"]}","RawMessageDelivery":"true"}'

# EventBridge bus
awslocal events create-event-bus --name appointments-bus

# SSM parameters
awslocal ssm put-parameter \
  --name /appointments/jwt/secret \
  --value "localstack-dev-jwt-secret-change-in-prod" \
  --type SecureString

awslocal ssm put-parameter \
  --name /appointments/rds/password \
  --value "localpassword" \
  --type SecureString

awslocal ssm put-parameter \
  --name /appointments/rds/pe/host \
  --value "localhost" \
  --type String

awslocal ssm put-parameter \
  --name /appointments/rds/cl/host \
  --value "localhost" \
  --type String

echo "Localstack initialization complete."
