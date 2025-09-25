const Sentry = require("@sentry/serverless");
const {
  CloudWatchLogsClient,
  CreateLogGroupCommand,
  CreateLogStreamCommand,
  PutLogEventsCommand,
  DescribeLogStreamsCommand,
} = require("@aws-sdk/client-cloudwatch-logs");

// Initialize Sentry
Sentry.AWSLambda.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracePropagationTargets: [],
});

// CloudWatch Logs client
const cloudwatchLogs = new CloudWatchLogsClient({
  region: process.env.AWS_REGION,
});

// Constants
const LOG_GROUP_NAME = process.env.LOG_GROUP_NAME;
const LOG_STREAM_NAME = "ses-email-events-stream";

/**
 * Ensure log group and stream exist
 */
async function ensureLogGroupExists() {
  try {
    // Create log group
    await cloudwatchLogs.send(
      new CreateLogGroupCommand({
        logGroupName: LOG_GROUP_NAME,
      })
    );
    console.log(`Created log group: ${LOG_GROUP_NAME}`);
  } catch (error) {
    if (error.name === "ResourceAlreadyExistsException") {
      console.log(`Log group already exists: ${LOG_GROUP_NAME}`);
    } else if (error.name === "AccessDeniedException") {
      // Log group might already exist or we don't have permission to create it
      // This is expected since we manually created the log groups
      console.log(
        `Cannot create log group (access denied), assuming it exists: ${LOG_GROUP_NAME}`
      );
    } else {
      console.error(`Error creating log group: ${error.message}`);
      throw error;
    }
  }

  try {
    // Create log stream
    await cloudwatchLogs.send(
      new CreateLogStreamCommand({
        logGroupName: LOG_GROUP_NAME,
        logStreamName: LOG_STREAM_NAME,
      })
    );
    console.log(`Created log stream: ${LOG_STREAM_NAME}`);
  } catch (error) {
    if (error.name === "ResourceAlreadyExistsException") {
      console.log(`Log stream already exists: ${LOG_STREAM_NAME}`);
    } else if (error.name === "AccessDeniedException") {
      // Log stream might already exist or we don't have permission to create it
      // This is expected since we manually created the log streams
      console.log(
        `Cannot create log stream (access denied), assuming it exists: ${LOG_STREAM_NAME}`
      );
    } else {
      console.error(`Error creating log stream: ${error.message}`);
      throw error;
    }
  }
}

/**
 * Get the sequence token for the log stream
 */
async function getSequenceToken() {
  try {
    const response = await cloudwatchLogs.send(
      new DescribeLogStreamsCommand({
        logGroupName: LOG_GROUP_NAME,
        logStreamNamePrefix: LOG_STREAM_NAME,
      })
    );

    if (response.logStreams && response.logStreams.length > 0) {
      return response.logStreams[0].uploadSequenceToken;
    }
    return null;
  } catch (error) {
    console.error(`Error getting sequence token: ${error.message}`);
    return null;
  }
}

/**
 * Write log message to CloudWatch Logs
 */
async function writeToCloudWatch(message) {
  try {
    const sequenceToken = await getSequenceToken();

    const logEvent = {
      timestamp: Date.now(),
      message: JSON.stringify(message),
    };

    const putLogEventsParams = {
      logGroupName: LOG_GROUP_NAME,
      logStreamName: LOG_STREAM_NAME,
      logEvents: [logEvent],
    };

    if (sequenceToken) {
      putLogEventsParams.sequenceToken = sequenceToken;
    }

    const response = await cloudwatchLogs.send(
      new PutLogEventsCommand(putLogEventsParams)
    );
    console.log("Successfully wrote event to CloudWatch Logs");
    return true;
  } catch (error) {
    console.error(`Error writing to CloudWatch Logs: ${error.message}`);

    // If InvalidSequenceTokenException, retry without token
    if (error.name === "InvalidSequenceTokenException") {
      try {
        const retryParams = {
          logGroupName: LOG_GROUP_NAME,
          logStreamName: LOG_STREAM_NAME,
          logEvents: [
            {
              timestamp: Date.now(),
              message: JSON.stringify(message),
            },
          ],
        };

        // Extract the expected sequence token from the error message
        const match = error.message.match(
          /The next expected sequenceToken is: (\S+)/
        );
        if (match) {
          retryParams.sequenceToken = match[1];
        }

        await cloudwatchLogs.send(new PutLogEventsCommand(retryParams));
        console.log("Successfully wrote event to CloudWatch Logs (retry)");
        return true;
      } catch (retryError) {
        console.error(`Retry failed: ${retryError.message}`);
        return false;
      }
    }
    return false;
  }
}

/**
 * Process SES event from SNS
 */
function processSESEvent(snsMessage) {
  const processedEvent = {
    timestamp: new Date().toISOString(),
    messageId: snsMessage.mail?.messageId || "unknown",
    eventType: snsMessage.eventType || "unknown",
    recipient: snsMessage.mail?.destination?.[0] || "unknown",
    source: snsMessage.mail?.source || "unknown",
    subject: snsMessage.mail?.commonHeaders?.subject || "unknown",
    rawEvent: snsMessage,
  };

  // Add event-specific details
  switch (snsMessage.eventType) {
    case "Bounce":
    case "bounce":
      const bounce = snsMessage.bounce || {};
      processedEvent.bounceType = bounce.bounceType || "unknown";
      processedEvent.bounceSubType = bounce.bounceSubType || "unknown";
      processedEvent.bouncedRecipients = bounce.bouncedRecipients || [];
      break;

    case "Complaint":
    case "complaint":
      const complaint = snsMessage.complaint || {};
      processedEvent.complaintFeedbackType =
        complaint.complaintFeedbackType || "unknown";
      processedEvent.complainedRecipients =
        complaint.complainedRecipients || [];
      break;

    case "Delivery":
    case "delivery":
      const delivery = snsMessage.delivery || {};
      processedEvent.processingTimeMillis = delivery.processingTimeMillis || 0;
      processedEvent.smtpResponse = delivery.smtpResponse || "unknown";
      break;

    case "Send":
    case "send":
      // Send events don't have additional details
      break;

    case "Reject":
    case "reject":
      const reject = snsMessage.reject || {};
      processedEvent.reason = reject.reason || "unknown";
      break;

    case "Rendering Failure":
    case "renderingFailure":
      const renderingFailure = snsMessage.failure || {};
      processedEvent.errorMessage = renderingFailure.errorMessage || "unknown";
      processedEvent.templateName = renderingFailure.templateName || "unknown";
      break;
  }

  return processedEvent;
}

/**
 * Lambda handler function
 */
exports.sesEventsHandler = Sentry.AWSLambda.wrapHandler(async (event, context) => {
  console.log("Received event:", JSON.stringify(event, null, 2));

  // Ensure log group and stream exist
  await ensureLogGroupExists();

  try {
    // Process SNS messages
    for (const record of event.Records) {
      if (record.EventSource === "aws:sns") {
        console.log("Processing SNS record:", JSON.stringify(record, null, 2));

        // Parse SNS message with error handling
        let snsMessage;
        try {
          console.log("Raw SNS Message:", record.Sns.Message);
          snsMessage = JSON.parse(record.Sns.Message);
        } catch (parseError) {
          console.error("Failed to parse SNS message:", parseError.message);
          console.error("Raw message content:", record.Sns.Message);
          continue; // Skip this record
        }

        // Check if this is an SES event
        if (snsMessage.eventType || snsMessage.notificationType) {
          // Handle both eventType (for configuration set events) and notificationType (for SNS notifications)
          if (snsMessage.notificationType) {
            snsMessage.eventType = snsMessage.notificationType;
          }

          const processedEvent = processSESEvent(snsMessage);

          // Write to CloudWatch Logs
          if (await writeToCloudWatch(processedEvent)) {
            console.log(
              `Processed ${snsMessage.eventType} event for ${processedEvent.recipient}`
            );
          } else {
            console.error("Failed to write event to CloudWatch");
          }
        } else {
          console.log("Received non-SES SNS message, skipping...");
        }
      }
    }
  } catch (error) {
    console.error(`Error processing event: ${error.message}`);
    throw error;
  }

  return {
    statusCode: 200,
    body: JSON.stringify("Events processed successfully"),
  };
});