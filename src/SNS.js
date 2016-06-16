"use strict";

import Parse from 'parse';
import log from 'npmlog';
import AWS from 'aws-sdk';
import APNS from './APNS';
import GCM from './GCM';
import { randomString } from './PushAdapterUtils';

const LOG_PREFIX = 'parse-server-push-adapter SNS';
const DEFAULT_REGION = "us-east-1";

function SNS(args) {
  if (typeof args !== 'object' || !args.accessKey || !args.secretKey) {
    throw new Parse.Error(Parse.Error.PUSH_MISCONFIGURED,
                          'SNS Configuration is invalid');
  }

  AWS.config.update({
    accessKeyId: args.accessKey,
    secretAccessKey: args.secretKey,
    region: args.region || DEFAULT_REGION,
  });
  this.sns = new AWS.SNS();
}


function generatePayload(data) {
  let gcmPayload = GCM.generateGCMPayload(data.data, randomString(10), Date.now(), data.expirationTime);
  let apnsPayload = APNS.generateNotification(data.data, data.expirationTime);
  let admPayload = { data: data.data };
  let wnsPayload = data.data;

  return {
    'GCM': JSON.stringify(gcmPayload),
    'APNS': JSON.stringify(apnsPayload),
    'APNS_SANDBOX': JSON.stringify(apnsPayload),
    'ADM': JSON.stringify(admPayload),
    'WNS': JSON.stringify(wnsPayload),
    'default': JSON.stringify(data.data),
   };
}


function generateMessageAttributes(data) {
  return {
    "AWS.SNS.MOBILE.WNS.Type": {
      DataType: "String",
      StringValue: "wns/raw",
    },
    "AWS.SNS.MOBILE.WNS.CachePolicy": {
      DataType: "String",
      StringValue: "cache",
    }
  }
}


/**
 * Send the Message, MessageStructure, and Target Amazon Resource Number (ARN) to SNS
 * @param sns The SNS object
 * @param device Device info
 * @param payload JSON-encoded message
 * @param messageAttributes SNS message attributes
 * @returns {Parse.Promise}
 */
function publishToSNS(sns, device, payload, messageAttributes) {
  let promise = new Parse.Promise();

  let params = {
    Message: JSON.stringify(payload),
    MessageStructure: 'json',
    TargetArn: device.deviceToken,
    MessageAttributes: messageAttributes
  };

  sns.publish(params, (err, data) => {
    let response = {
      device: {
        deviceType: device.deviceType,
        deviceToken: device.deviceToken.toString('hex')
      }
    };

    if (err != null) {
      log.error(LOG_PREFIX, "Error sending push: ", arn);
      log.verbose(LOG_PREFIX, "Error details: ", err);
      response.transmitted = false;
      if (err.stack) {
        response.response = err.stack;
      }
      return promise.resolve(response);
    }

    if (data && data.MessageId) {
      log.verbose(LOG_PREFIX, "Successfully sent push to " + data.MessageId);
    }

    response.transmitted = true;
    response.response = data;
    promise.resolve(response);
  });

  return promise;
}


/**
 * Send SNS request.
 * @param {Object} data The data we need to send, the format is the same with api request body
 * @param {Array} devices A array of devices
 * @returns {Object} A promise which is resolved after we get results from gcm
 */
SNS.prototype.send = function(data, devices) {
  let payload = generatePayload(data);
  let messageAttributes = generateMessageAttributes(data);

  let promises = devices.map( (device) => {
    return publishToSNS(this.sns, device, payload, messageAttributes);
  });
  return Parse.Promise.when(promises);
};


module.exports = SNS;
export default SNS;
