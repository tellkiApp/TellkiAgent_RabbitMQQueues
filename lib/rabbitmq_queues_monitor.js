/**
 * This script was developed by Guberni and is part of Tellki's Monitoring Solution
 *
 * July, 2015
 * 
 * Version 1.0
 * 
 * DESCRIPTION: Monitor RabbitMQ Queues
 *
 * SYNTAX: node rabbitmq_queues_monitor.js <METRIC_STATE> <HOST> <PORT> <VHOST_FILTER> <QUEUE_FILTER> <USER_NAME> <PASS_WORD>
 * 
 * EXAMPLE: node rabbitmq_queues_monitor.js "1,1,1,1,1,1,1,1,1" "10.10.2.5" "15672" "" "" "username" "password"
 *
 * README:
 *    <METRIC_STATE> is generated internally by Tellki and it's only used by Tellki default monitors: 1 - metric is on; 0 - metric is off
 *    <HOST> RabbitMQ ip address or hostname
 *    <PORT> RabbitMQ port
 *    <VHOST_FILTER> RabbitMQ filter queues by vhosts
 *    <QUEUE_FILTER> RabbitMQ filter queues by name 
 *    <USERNAME> RabbitMQ username
 *    <PASSWORD> RabbitMQ password
 */

var http = require('http');
 
/**
 * Metrics.
 */
var metrics = [];

metrics.push({ id: '1828:Memory:4',                       state: false, get: function(o) { return (o['memory'] / 1024 / 1024).toFixed(2); } });
metrics.push({ id: '1829:Consumers:4',                    state: false, get: function(o) { return (o['consumers']); } });
metrics.push({ id: '1830:Pending Acks:4',                 state: false, get: function(o) { return (o['backing_queue_status']['pending_acks']); } });
metrics.push({ id: '1831:Messages:4',                     state: false, get: function(o) { return (o['messages']); } });
metrics.push({ id: '1832:Messages Rate:4',                state: false, get: function(o) { return (o['messages_details']['rate']); } });
metrics.push({ id: '1833:Messages Unacknowledged:4',      state: false, get: function(o) { return (o['messages_unacknowledged']); } });
metrics.push({ id: '1834:Messages Unacknowledged Rate:4', state: false, get: function(o) { return (o['messages_unacknowledged_details']['rate']); } });
metrics.push({ id: '1835:Messages Ready:4',               state: false, get: function(o) { return (o['messages_ready']); } });
metrics.push({ id: '1836:Messages Ready Rate:4',          state: false, get: function(o) { return (o['messages_ready_details']['rate']); } });

var RequestURLs = {
  queues : '/api/queues/'
}
 
var inputLength = 7;
 
/**
 * Entry point.
 */
(function() {
  try
  {
    monitorInput(process.argv);
  }
  catch (err)
  { 
    if (err instanceof InvalidParametersNumberError)
    {
      console.log(err.message);
      process.exit(err.code);
    }
    else if (err instanceof UnknownHostError)
    {
      console.log(err.message);
      process.exit(err.code);
    }
    else
    {
      console.log(err.message);
      process.exit(1);
    }
  }
}).call(this);

// ############################################################################
// PARSE INPUT

/**
 * Verify number of passed arguments into the script, process the passed arguments and send them to monitor execution.
 * Receive: arguments to be processed
 */
function monitorInput(args)
{
  args = args.slice(2);
  if (args.length != inputLength)
    throw new InvalidParametersNumberError();
  
  //<METRIC_STATE>
  var tokens = args[0].replace('"', '').split(',');
  for (var i = 0; i < tokens.length; i++)
    metrics[i].state = (tokens[i] === '1');
  
  //<HOST> 
  var hostname = args[1];
  
  //<PORT> 
  var port = args[2];
  if (port.length === 0)
    port = '15672';

  // <VHOST_FILTER>
  var arg = args[3].replace(/\"/g, '');
  var vhostFilter = arg.length === 0 ? [] : arg.split(';');

  // <QUEUE_FILTER>
  arg = args[4].replace(/\"/g, '');
  var queueFilter = arg.length === 0 ? [] : arg.split(';');

  // <USER_NAME>
  var username = args[5];
  username = username.length === 0 ? '' : username;
  username = username === '\"\"' ? '' : username;
  if (username.length === 1 && username === '\"')
    username = '';
  
  // <PASS_WORD>
  var passwd = args[6];
  passwd = passwd.length === 0 ? '' : passwd;
  passwd = passwd === '\"\"' ? '' : passwd;
  if (passwd.length === 1 && passwd === '\"')
    passwd = '';
  
  if (username === '{0}')
    username = passwd = '';

  // Create request object to be executed.
  var request = new Object()
  request.hostname = hostname;
  request.port = port;
  request.vhostFilter = vhostFilter;
  request.queueFilter = queueFilter;
  request.username = username;
  request.passwd = passwd;
  
  // Get metrics.
  processRequest(request);
}

// ############################################################################
// GET METRICS

/**
 * Retrieve metrics information
 * Receive: object request containing configuration
 */
function processRequest(request) 
{
  getResponse(RequestURLs.queues, request, function (data)
  {
    var metricsObj = [];
    data = JSON.parse(data);

    for (var d in data)
    {
      var vhost = data[d]['vhost'];
      var queue = data[d]['name'];
      
      if (match(vhost, request.vhostFilter) && match(queue, request.queueFilter))
        getMetrics(data[d], metricsObj, vhost + queue);
    }

    output(metricsObj);
  });
}

function getMetrics(data, metricsObj, object)
{
  for (var i = 0; i < metrics.length; i++)
  {
    if (metrics[i].state)
    {
      var metric = new Object();
      metric.id = metrics[i].id;
      metric.val = metrics[i].get(data);
      if (object !== undefined)
        metric.object = object;
      metricsObj.push(metric);
    }
  }
}

function getResponse(path, request, callback)
{
  // Create HTTP request options.
  var options = {
    method: 'GET',
    hostname: request.hostname,
    port: request.port,
    path: path
  };

  if (request.username !== '')
    options.auth = request.username + ':' + request.passwd;

  // Do HTTP request.
  var req = http.request(options, function (res) {
    var code = res.statusCode;
    var data = '';

    if (code != 200)
    {
      if (code == 401)
      {
        errorHandler(new InvalidAuthenticationError());
      }
      else
      {
        var exception = new HTTPError();
        exception.message = 'Response error (' + code + ').';
        errorHandler(exception);
      }
    }
    
    res.setEncoding('utf8');
    
    // Receive data.
    res.on('data', function (chunk) {
      data += chunk;
    });
    
    // On HTTP request end.
    res.on('end', function (res) {
      callback(data);
    });
  });
  
  // On Error.
  req.on('error', function (e) {
    if(e.code === 'ENOTFOUND' || e.code === 'ECONNREFUSED')
      errorHandler(new UnknownHostError());
    else
      errorHandler(e);
  });

  req.end();
}

function match(matchValue, matchList)
{
  if (matchList.length === 0)
    return true;
  
  for (var i = 0; i < matchList.length; i++)
  {
    var match = matchList[i];
    
    if (matchValue.trim().toLowerCase().indexOf(match.trim().toLowerCase()) !== -1)
    {
      return true;
    }
  }
  
  return false;
}

// ############################################################################
// OUTPUT METRICS

/**
 * Send metrics to console
 * Receive: metrics list to output
 */
function output(metrics)
{
  for (var i in metrics)
  {
    var out = '';
    var metric = metrics[i];
    
    out += metric.id;
    out += '|';
    out += metric.val;
    out += '|';
    if (metric.object !== undefined)
      out += metric.object;
    out += '|';
    
    console.log(out);
  }
}

// ############################################################################
// ERROR HANDLER

/**
 * Used to handle errors of async functions
 * Receive: Error/Exception
 */
function errorHandler(err)
{
  if (err instanceof InvalidAuthenticationError)
  {
    console.log(err.message);
    process.exit(err.code);
  }
  else if (err instanceof UnknownHostError)
  {
    console.log(err.message);
    process.exit(err.code);
  }
  else if (err instanceof MetricNotFoundError)
  {
    console.log(err.message);
    process.exit(err.code);   
  }
  else
  {
    console.log(err.message);
    process.exit(1);
  }
}

// ############################################################################
// EXCEPTIONS

/**
 * Exceptions used in this script.
 */
 function InvalidAuthenticationError() {
    this.name = 'InvalidAuthenticationError';
    this.message = 'Invalid authentication.';
  this.code = 2;
}
InvalidAuthenticationError.prototype = Object.create(Error.prototype);
InvalidAuthenticationError.prototype.constructor = InvalidAuthenticationError;

function InvalidParametersNumberError() {
    this.name = 'InvalidParametersNumberError';
    this.message = 'Wrong number of parameters.';
  this.code = 3;
}
InvalidParametersNumberError.prototype = Object.create(Error.prototype);
InvalidParametersNumberError.prototype.constructor = InvalidParametersNumberError;

function UnknownHostError() {
    this.name = 'UnknownHostError';
    this.message = 'Unknown host.';
  this.code = 28;
}
UnknownHostError.prototype = Object.create(Error.prototype);
UnknownHostError.prototype.constructor = UnknownHostError;

function MetricNotFoundError() {
    this.name = 'MetricNotFoundError';
    this.message = '';
  this.code = 8;
}
MetricNotFoundError.prototype = Object.create(Error.prototype);
MetricNotFoundError.prototype.constructor = MetricNotFoundError;