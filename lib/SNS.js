"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol ? "symbol" : typeof obj; };

var _parse = require('parse');

var _parse2 = _interopRequireDefault(_parse);

var _npmlog = require('npmlog');

var _npmlog2 = _interopRequireDefault(_npmlog);

var _awsSdk = require('aws-sdk');

var _awsSdk2 = _interopRequireDefault(_awsSdk);

var _APNS = require('./APNS');

var _APNS2 = _interopRequireDefault(_APNS);

var _GCM = require('./GCM');

var _GCM2 = _interopRequireDefault(_GCM);

var _PushAdapterUtils = require('./PushAdapterUtils');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var LOG_PREFIX = 'parse-server-push-adapter SNS';
var DEFAULT_REGION = "us-east-1";

function SNS(args) {
  if ((typeof args === 'undefined' ? 'undefined' : _typeof(args)) !== 'object' || !args.accessKey || !args.secretKey) {
    throw new _parse2.default.Error(_parse2.default.Error.PUSH_MISCONFIGURED, 'SNS Configuration is invalid');
  }

  _awsSdk2.default.config.update({
    accessKeyId: args.accessKey,
    secretAccessKey: args.secretKey,
    region: args.region || DEFAULT_REGION
  });
  this.sns = new _awsSdk2.default.SNS();
}

function generatePayload(data) {
  var gcmPayload = _GCM2.default.generateGCMPayload(data.data, (0, _PushAdapterUtils.randomString)(10), Date.now(), data.expirationTime);
  var apnsPayload = _APNS2.default.generateNotification(data.data, data.expirationTime);
  var admPayload = { data: data.data };
  var wnsPayload = data.data;

  return {
    'GCM': JSON.stringify(gcmPayload),
    'APNS': JSON.stringify(apnsPayload),
    'APNS_SANDBOX': JSON.stringify(apnsPayload),
    'ADM': JSON.stringify(admPayload),
    'WNS': JSON.stringify(wnsPayload),
    'default': JSON.stringify(data.data)
  };
}

function generateMessageAttributes(data) {
  return {
    "AWS.SNS.MOBILE.WNS.Type": {
      DataType: "String",
      StringValue: "wns/raw"
    },
    "AWS.SNS.MOBILE.WNS.CachePolicy": {
      DataType: "String",
      StringValue: "cache"
    }
  };
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
  var promise = new _parse2.default.Promise();

  var params = {
    Message: JSON.stringify(payload),
    MessageStructure: 'json',
    TargetArn: device.deviceToken,
    MessageAttributes: messageAttributes
  };

  sns.publish(params, function (err, data) {
    var response = {
      device: {
        deviceType: device.deviceType,
        deviceToken: device.deviceToken.toString('hex')
      }
    };

    if (err != null) {
      _npmlog2.default.error(LOG_PREFIX, "Error sending push: ", arn);
      _npmlog2.default.verbose(LOG_PREFIX, "Error details: ", err);
      response.transmitted = false;
      if (err.stack) {
        response.response = err.stack;
      }
      return promise.resolve(response);
    }

    if (data && data.MessageId) {
      _npmlog2.default.verbose(LOG_PREFIX, "Successfully sent push to " + data.MessageId);
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
SNS.prototype.send = function (data, devices) {
  var _this = this;

  var payload = generatePayload(data);
  var messageAttributes = generateMessageAttributes(data);

  var promises = devices.map(function (device) {
    return publishToSNS(_this.sns, device, payload, messageAttributes);
  });
  return _parse2.default.Promise.when(promises);
};

module.exports = SNS;
exports.default = SNS;