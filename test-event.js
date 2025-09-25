// Test event for local development and testing
// Run with: node test-event.js

// Set environment variables for testing
process.env.LOG_GROUP_NAME = '/aws/ses/email-events-test';
process.env.AWS_REGION = 'us-east-1';
process.env.NODE_ENV = 'test';

const { sesEventsHandler } = require('./handler');

const testEvent = {
  Records: [
    {
      EventSource: "aws:sns",
      Sns: {
        Message: JSON.stringify({
          eventType: "delivery",
          mail: {
            timestamp: "2023-01-01T12:00:00.000Z",
            source: "sender@example.com",
            sourceArn: "arn:aws:ses:us-east-1:123456789012:identity/example.com",
            sourceIp: "192.0.2.1",
            sendingAccountId: "123456789012",
            messageId: "0000014a-f4d6-4f12-ac76-d6efd6d6d6d6-000000",
            destination: ["recipient@example.com"],
            headersTruncated: false,
            headers: [
              {
                name: "From",
                value: "sender@example.com"
              },
              {
                name: "To",
                value: "recipient@example.com"
              },
              {
                name: "Subject",
                value: "Test Email"
              }
            ],
            commonHeaders: {
              from: ["sender@example.com"],
              to: ["recipient@example.com"],
              subject: "Test Email"
            }
          },
          delivery: {
            timestamp: "2023-01-01T12:00:05.000Z",
            processingTimeMillis: 5000,
            recipients: ["recipient@example.com"],
            smtpResponse: "250 OK",
            reportingMTA: "a8-70.smtp-out.amazonses.com"
          }
        })
      }
    }
  ]
};

const testContext = {
  functionName: 'ses-events-processor-test',
  functionVersion: '$LATEST',
  invokedFunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:ses-events-processor-test',
  awsRequestId: 'test-request-id'
};

async function runTest() {
  try {
    console.log('Running test event...');
    const result = await sesEventsHandler(testEvent, testContext);
    console.log('Test completed successfully:', result);
  } catch (error) {
    console.error('Test failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  runTest();
}