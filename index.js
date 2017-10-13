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
//  We use Feathers and the KNEX library to support many types of databases.
//  Remember to install any needed database clients e.g. "mysql", "pg"
const knex = require('knex');
let db = null;  //  Instance of the KNEX library.

//  End Common Declarations
//  //////////////////////////////////////////////////////////////////////////////////////////

//  //////////////////////////////////////////////////////////////////////////////////////////
//  Begin Message Processing Code

//  Our database settings are stored in the Google Cloud Metadata store under this prefix.
const metadataPrefix = 'sigfox-db';
const metadataKeys = {   //  Keys we use and their default values, before prepending metadataPrefix.
  client: null,          //  Type of database client e.g mysql
  host: null,            //  Address of database server e.g. 127.0.0.1
  user: 'user',          //  User ID for accessing the database e.g. user
  password: null,        //  Password for accessing the database.
  name: 'sigfox',        //  Name of the database, e.g. sigfox
  table: 'sensordata',   //  Name of the table to store sensor data e.g. sensordata
  version: null,         //  Version number of database, used only by Postgres e.g. 7.2
  id: 'id',              //  Name of the ID field in the table e.g. id
};
//  Name of Feathers service.
const serviceName = 'sensorrecorder';

function wrap() {
  //  Wrap the module into a function so that all Google Cloud resources are properly disposed.
  const sgcloud = require('sigfox-gcloud'); //  sigfox-gcloud Framework
  const googlemetadata = require('sigfox-gcloud/lib/google-metadata');  //  For accessing Google Metadata.
  const feathers = require('feathers');
  const service = require('feathers-knex');
  const errorHandler = require('feathers-errors/handler');

  let getMetadataConfigPromise = null;  //  Promise for returning the config.

  function getMetadataConfig(req, metadataPrefix0, metadataKeys0) {
    //  Fetch the metadata config from the Google Cloud Metadata store.  metadataPrefix is the common
    //  prefix for all config keys, e.g. "sigfox-db".  metadataKeys is a map of the key suffix
    //  and the default values.  Returns a promise for the map of metadataKeys to values.
    //  We use the Google Cloud Metadata store because it has an editing screen and is easier
    //  to deploy, compared to a config file.
    if (getMetadataConfigPromise) return getMetadataConfigPromise;  //  Return the cache.
    sgcloud.log(req, 'getMetadataConfig', { metadataPrefix0, metadataKeys0 });
    let authClient = null;
    let metadata = null;
    //  Get a Google auth client.
    getMetadataConfigPromise = googlemetadata.authorize(req)
      .then((res) => { authClient = res; })
      //  Get the project metadata.
      .then(() => googlemetadata.getProjectMetadata(req, authClient))
      //  Convert the metadata to a JavaScript object.
      .then(res => googlemetadata.convertMetadata(req, res))
      .then((res) => { metadata = res; })
      .then(() => {
        //  Hunt for the metadata keys in the metadata object and copy them.
        const config = Object.assign({}, metadataKeys0);
        for (const configKey of Object.keys(config)) {
          const metadataKey = metadataPrefix0 + configKey;
          if (metadata[metadataKey] !== null && metadata[metadataKey] !== undefined) {
            //  Copy the non-null values.
            config[configKey] = metadata[metadataKey];
          }
        }
        const result = config;
        sgcloud.log(req, 'getMetadataConfig', { result, metadataPrefix0, metadataKeys0 });
        return result;
      })
      .catch((error) => {
        sgcloud.log(req, 'getMetadataConfig', { error, metadataPrefix0, metadataKeys0 });
        throw error;
      });
    return getMetadataConfigPromise;
  }

  function getDatabaseConfig(req) {
    //  Return the database connection config from the Google Cloud Metadata store.
    return getMetadataConfig(req, metadataPrefix, metadataKeys)
      .then((metadata) => {
        const dbconfig = {
          client: metadata.client,  //  e.g. 'pg'
          connection: {
            host: metadata.host,
            user: metadata.user,
            password: metadata.password,
            database: metadata.name,
          },
        };
        //  Set the version for Postgres.
        if (metadata.version) dbconfig.version = metadata.version;
        //  Create the KNEX instance for accessing the database.
        db = knex(dbconfig);
        return dbconfig;
      })
      .catch((error) => {
        sgcloud.log(req, 'getDatabaseConfig', { error });
        throw error;
      });
  }

  function createTable(req) {
    //  Create the sensordata table if it doesn't exist.
    //  Returns a promise.
    return getDatabaseConfig(req)
      .then(() => {
        return db.schema.createTable(metadataKeys.table, (table) => {
          console.log(`Creating table ${metadataKeys.table}`);
          table.increments(metadataKeys.id);
          table.string('text');
        });
      })
      .catch((error) => {
        sgcloud.log(req, 'createTable', { error });
        throw error;
      });
  }

  //  Feathers service for accessing the database.
  let servicePromise = null;

  function createService(req) {
    //  Create the Feathers service that will provide database access.
    //  Returns a promise.
    if (servicePromise) return servicePromise;
    servicePromise = getDatabaseConfig(req)
      .then(() => {
        const Model = db;
        const name = metadataKeys.table;
        const id = metadataKeys.id;
        const events = null;
        const paginate = null;
        const app = feathers()
          .use(`/${serviceName}`, service({ Model, name, id, events, paginate }))
          .use(errorHandler());
        return app;
      })
      .catch((error) => {
        sgcloud.log(req, 'createService', { error });
        throw error;
      });
    return servicePromise;
  }

  function task(req, device, body, msg) {
    let app = null;
    return createService(req)
      .then((res) => { app = res; })
      .then(() => {
        return app.service(serviceName).create({
          text: 'Message created on server',
        });
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
    createTable,
    getMetadataConfig,
    getDatabaseConfig,
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
      //  Dispose the wrapper and all resources inside.
      .then((result) => { wrapper = null; return result; })
      //  Suppress the error or Google Cloud will call the function again.
      .catch((error) => { wrapper = null; return error; });
  },

  //  For unit test only.
  task: wrap().task,
  createTable: wrap().createTable,
  getMetadataConfig: wrap().getMetadataConfig,
  getDatabaseConfig: wrap().getDatabaseConfig,
  metadataPrefix,
  metadataKeys,
};
