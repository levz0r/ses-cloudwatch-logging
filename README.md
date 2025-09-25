# SES CloudWatch Logging

A serverless AWS Lambda function that processes Amazon SES email events and logs them to CloudWatch Logs for centralized monitoring and analysis.

## Features

- ✅ Real-time processing of SES email events
- ✅ Structured logging to CloudWatch Logs
- ✅ Support for all SES event types (send, delivery, bounce, complaint, etc.)
- ✅ Automatic log group and stream creation
- ✅ Robust error handling with retry logic
- ✅ Sentry integration for error tracking
- ✅ Serverless deployment with proper IAM permissions

## Architecture

```
SES Email Events → SNS Topic → Lambda Function → CloudWatch Logs
```

The system processes email events in real-time:

1. **SES** publishes email events to an SNS topic
2. **SNS** triggers the Lambda function with event data
3. **Lambda** processes and structures the event information
4. **CloudWatch Logs** stores the structured events for analysis

## Prerequisites

- AWS CLI configured with appropriate permissions
- Node.js 18.x or later
- Serverless Framework v3.x

## Quick Start

1. **Clone the repository**
   ```bash
   git clone https://github.com/levz0r/ses-cloudwatch-logging.git
   cd ses-cloudwatch-logging
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables** (optional)
   ```bash
   export SENTRY_DSN=your-sentry-dsn-here
   ```

4. **Deploy to AWS**
   ```bash
   # Deploy to development environment
   npm run deploy:dev

   # Deploy to production environment
   npm run deploy:prod
   ```

## Configuration

### Environment Variables

- `SENTRY_DSN` - Optional Sentry DSN for error tracking
- `NODE_ENV` - Automatically set based on deployment stage

### AWS Resources Created

The deployment creates:

- **Lambda Function**: Processes SES events
- **IAM Role**: With minimal required CloudWatch permissions
- **Log Group**: `/aws/ses/email-events-{stage}`
- **Log Stream**: `ses-email-events-stream`

### SNS Topic Setup

You need to create an SNS topic and configure SES to publish events to it:

```bash
# Create SNS topic
aws sns create-topic --name ses-events-topic-dev --region us-east-1

# Configure SES configuration set (replace TOPIC_ARN)
aws ses create-configuration-set --configuration-set Name=email-tracking-dev

aws ses create-configuration-set-event-destination \
  --configuration-set-name email-tracking-dev \
  --event-destination Name=cloudwatch-logging \
    Enabled=true \
    MatchingEventTypes=send,reject,bounce,complaint,delivery,renderingFailure \
    SNSDestination={TopicARN=arn:aws:sns:us-east-1:ACCOUNT:ses-events-topic-dev}
```

## Event Structure

The Lambda function processes and structures SES events with the following format:

```json
{
  "timestamp": "2023-01-01T12:00:00.000Z",
  "messageId": "0000014a-f4d6-4f12-ac76-d6efd6d6d6d6-000000",
  "eventType": "delivery",
  "recipient": "recipient@example.com",
  "source": "sender@example.com",
  "subject": "Test Email",
  "processingTimeMillis": 5000,
  "smtpResponse": "250 OK",
  "rawEvent": { /* original SES event */ }
}
```

### Supported Event Types

- **Send**: Email was sent successfully
- **Delivery**: Email was delivered to recipient's mail server
- **Bounce**: Email bounced (temporary or permanent)
- **Complaint**: Recipient marked email as spam
- **Reject**: Email was rejected by SES
- **Rendering Failure**: Template rendering failed

## CloudWatch Logs Analysis

### Sample Queries

Use CloudWatch Logs Insights to analyze email performance:

```sql
-- Find all bounce events in the last 24 hours
fields @timestamp, eventType, recipient, bounceType, bounceSubType
| filter eventType = "bounce"
| sort @timestamp desc
| limit 100

-- Calculate bounce rate by hour
fields @timestamp, eventType
| filter eventType in ["send", "bounce"]
| stats count(*) as total, sum(eventType = "bounce") as bounces by bin(1h)
| sort @timestamp desc

-- Find high-complaint recipients
fields @timestamp, recipient, complaintFeedbackType
| filter eventType = "complaint"
| stats count(*) as complaints by recipient
| sort complaints desc
```

### Setting Up Alerts

Create CloudWatch alarms for critical metrics:

```bash
# Alert on high bounce rates
aws cloudwatch put-metric-alarm \
  --alarm-name "SES-High-Bounce-Rate" \
  --alarm-description "Alert when bounce rate exceeds 5%" \
  --metric-name BounceRate \
  --namespace AWS/SES \
  --statistic Average \
  --period 300 \
  --threshold 5.0 \
  --comparison-operator GreaterThanThreshold
```

## Local Development

### Testing the Function

Run the included test with a sample SES event:

```bash
npm test
```

### Manual Testing

You can also test the function with custom events by modifying `test-event.js`.

## Deployment Commands

```bash
# Development deployment
npm run deploy:dev

# Production deployment
npm run deploy:prod

# View function logs
npm run logs

# Remove all resources
npm run remove
```

## Cost Considerations

- **Lambda**: Minimal cost for event processing
- **CloudWatch Logs**: Charges for data ingestion and storage
- **SNS**: Small cost per message delivered

For high-volume email senders, consider:
- Implementing log retention policies
- Filtering events to only log bounces and complaints
- Using multiple log streams for better performance

## Security

- Lambda function uses minimal IAM permissions
- Only has access to its specific log group
- No sensitive data is logged (message content excluded)
- Supports VPC deployment if required

## Monitoring

The function includes:
- Structured logging for debugging
- Sentry integration for error tracking
- CloudWatch metrics for Lambda performance
- Retry logic for CloudWatch API failures

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Related Blog Post

For a detailed walkthrough of the implementation, see: [Building Centralized SES Email Event Logging with CloudWatch](https://lev.engineer/blog/building-centralized-ses-email-event-logging-with-cloudwatch)

## Support

If you encounter any issues or have questions:

1. Check the [Issues](https://github.com/levz0r/ses-cloudwatch-logging/issues) page
2. Review the CloudWatch logs for error details
3. Verify your SES configuration and SNS topic setup
4. Ensure proper IAM permissions are configured