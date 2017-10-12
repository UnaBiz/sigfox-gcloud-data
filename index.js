//  Google Cloud Function sendToUbidots is triggered when a
//  Sigfox message is sent to the PubSub message queue
//  sigfox.types.sendToUbidots.
//  We call the Ubidots API to send the Sigfox message to Ubidots.

//  //////////////////////////////////////////////////////////////////////////////////////////
//  Begin Common Declarations

/* eslint-disable camelcase, no-console, no-nested-ternary, import/no-dynamic-require,
 import/newline-after-import, import/no-unresolved, global-require, max-len */
//  Enable DNS cache in case we hit the DNS quota for Google Cloud Functions.
require('dnscache')({ enable: true });
process.on('uncaughtException', err => console.error(err.message, err.stack));  //  Display uncaught exceptions.
if (process.env.FUNCTION_NAME) {
  //  Load the Google Cloud Trace and Debug Agents before any require().
  //  Only works in Cloud Function.
  require('@google-cloud/trace-agent').start();
  require('@google-cloud/debug-agent').start();
}

//  End Common Declarations
//  //////////////////////////////////////////////////////////////////////////////////////////

//  //////////////////////////////////////////////////////////////////////////////////////////
//  Begin Message Processing Code

// const config = require('./config.json');  //  Ubidots API Key
const knex = require('knex');
const dbconfig = {
  client: 'mysql',
  connection: {
    host : '???',
    user : 'user',
    password : '???',
    database : 'sigfox',
  },
};
const dbconfig2 = {
  client: 'pg',
  version: '7.2',
  connection: {
    host : '127.0.0.1',
    user : 'your_database_user',
    password : 'your_database_password',
    database : 'myapp_test',
  },
};
const db = knex(dbconfig);

const serviceName = 'sensorrecorder';
const name = 'sensordata';
const id = 'id';
const events = null;
const paginate = null;

db.schema.createTable(name, table => {
  console.log(`Creating table ${name}`);
  table.increments(id);
  table.string('text');
});

/*
sigfox-dbclient	mysql
sigfox-dbhost	127.0.0.1
sigfox-dbname
sigfox-dbpassword
sigfox-dbtable
sigfox-dbuser
sigfox-dbversion
sigfox-dbid
*/

function wrap() {
  //  Wrap the module into a function so that all Google Cloud resources are properly disposed.
  const sgcloud = require('sigfox-gcloud'); //  sigfox-gcloud Framework
  const feathers = require('feathers');
  const service = require('feathers-knex');
  const errorHandler = require('feathers-errors/handler');

  const Model = db;
  const app = feathers()
    .use(`/${serviceName}`, service({ Model, name, id, events, paginate }))
    .use(errorHandler());

  function task(req, device, body, msg) {
    return app.service(serviceName).create({
      text: 'Message created on server',
    })
      .then(message => console.log('Created message', message))
      //  Return the message for the next processing step.
      .then(() => msg)
      .catch((error) => { sgcloud.log(req, 'task', { error, device, body, msg }); throw error; });
  }

  return {
    //  Expose these functions outside of the wrapper.
    //  When this Google Cloud Function is triggered, we call main() which calls task().
    serveQueue: event => sgcloud.main(event, task),

    //  For unit test only.
    task,
    loadDevicesByClient,
    getVariablesByDevice,
    setVariables,
    mergeDevices,
  };
}

//  End Message Processing Code
//  //////////////////////////////////////////////////////////////////////////////////////////

//  //////////////////////////////////////////////////////////////////////////////////////////
//  Main Function

module.exports = {
  //  Expose these functions to be called by Google Cloud Function.

  main: (event) => {
    //  Create a wrapper and serve the PubSub event.
    let wrapper = wrap();
    return wrapper.serveQueue(event)
      .then((result) => {
        wrapper = null;  //  Dispose the wrapper and all resources inside.
        return result;
      })
      .catch((error) => {
        wrapper = null;  //  Dispose the wrapper and all resources inside.
        return error;  //  Suppress the error or Google Cloud will call the function again.
      });
  },

  //  For unit test only.
  task: wrap().task,
  loadDevicesByClient: wrap().loadDevicesByClient,
  getVariablesByDevice: wrap().getVariablesByDevice,
  setVariables: wrap().setVariables,
  mergeDevices: wrap().mergeDevices,
  allKeys,
};
