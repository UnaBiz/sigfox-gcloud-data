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
//  We use KNEX library to support many types of databases.
//  Remember to install any needed database clients e.g. "mysql", "pg"
const knex = require('knex');

//  End Common Declarations
//  //////////////////////////////////////////////////////////////////////////////////////////

//  //////////////////////////////////////////////////////////////////////////////////////////
//  Begin Message Processing Code

//  Our database settings are stored in the Google Cloud Metadata store under this prefix.
const metadataPrefix = 'sigfox-db';
const metadataKeys = {   //  Keys we use and their default values, before prepending metadataPrefix.
  client: null,          //  Database client to be used e.g mysql. Must be installed from npm.
  host: null,            //  Address of database server e.g. 127.0.0.1
  user: 'user',          //  User ID for accessing the database e.g. user
  password: null,        //  Password for accessing the database.
  name: 'sigfox',        //  Name of the database, e.g. sigfox
  table: 'sensordata',   //  Name of the table to store sensor data e.g. sensordata
  version: null,         //  Version number of database, used only by Postgres e.g. 7.2
  id: 'uuid',            //  Name of the ID field in the table e.g. uuid
};

//  Default fields to be created in sensordata table. Format: fieldname, indexed?, comment
const sensorfields = (tbl) => ({
  uuid: [tbl.uuid, false, 'Primary key: Unique message ID in UUID format, e.g. 4cf3ad36-3d3e-415c-a25b-9f8ab2bb4466'],
  timestamp: [tbl.timestamp, true, 'Timestamp of message receipt at basestation., e.g. 1507798768000'],

  alt: [tbl.float, false, 'Altitude in metres above sea level, used by send-alt-structured demo, e.g. 86.4'],
  avgSnr: [tbl.float, false, 'Sigfox average signal-to-noise ratio, e.g. 59.84'],
  baseStationLat: [tbl.float, false, 'Sigfox basestation latitude.  Usually truncated to 0 decimal points, e.g. 1'],
  baseStationLng: [tbl.float, false, 'Sigfox basestation longitude.  Usually truncated to 0 decimal points, e.g. 104'],
  baseStationTime: [tbl.integer, false, 'Sigfox timestamp of message receipt at basestation, in seconds since epoch (1/1/1970), e.g. 1507798768'],
  // callbackTimestamp: [f => tbl.timestamp.bind(tbl)(f).defaultTo(knex.fn.now()), false, 'Timestamp at which sigfoxCallback was called, e.g. 1507798769710'],
  data: [tbl.string, false, 'Sigfox message data, e.g. b0510001a421f90194056003'],
  datetime: [tbl.string, false, 'Human-readable datetime, e.g. 2017-10-12 08:59:29'],
  device: [tbl.string, true, 'Sigfox device ID, e.g. 2C1C85'],
  deviceLat: [tbl.float, false, 'Latitude of GPS tracker e.g. UnaTumbler.'],
  deviceLng: [tbl.float, false, 'Longitude of GPS tracker e.g. UnaTumbler.'],
  duplicate: [tbl.boolean, true, 'Sigfox sets to false if this is the first message received among all basestations.'],
  geolocLat: [tbl.float, false, 'Sigfox Geolocation latitude of device.'],
  geolocLng: [tbl.float, false, 'Sigfox Geolocation longitude of device.'],
  geolocLocationAccuracy: [tbl.float, false, 'Sigfox Geolocation accuracy of device.'],
  hmd: [tbl.float, false, '% Humidity, used by send-alt-structured demo, e.g. 50.5'],
  lat: [tbl.float, false, 'Latitude for rendering in Ubidots.'],
  lng: [tbl.float, false, 'Longitude for rendering in Ubidots.'],
  rssi: [tbl.float, true, 'Sigfox signal strength, e.g. -122'],
  seqNumber: [tbl.integer, true, 'Sigfox message sequence number, e.g. 2426'],
  snr: [tbl.float, false, 'Sigfox message signal-to-noise ratio, e.g. 21.61'],
  station: [tbl.string, true, 'Sigfox basestation ID, e.g. 2464'],
  tmp: [tbl.float, false, 'Temperature in degrees Celsius, used by send-alt-structured demo, e.g. 25.6'],
});

let db = null;  //  Instance of the KNEX library.
let tableInfo = null;  //  Contains the actual columns in the sensordata table.
let getMetadataConfigPromise = null;  //  Promise for returning the metadata config.
let getDatabaseConfigPromise = null;  //  Promise for returning the database connection.
let reuseCount = 0;

function wrap() {
  //  Wrap the module into a function so that all Google Cloud resources are properly disposed.
  const sgcloud = require('sigfox-gcloud'); //  sigfox-gcloud Framework
  const googlemetadata = require('sigfox-gcloud/lib/google-metadata');  //  For accessing Google Metadata.

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

  function getDatabaseConfig(req, reload) {
    //  Return the database connection config from the Google Cloud Metadata store.
    //  Set the global db with the KNEX object and tableInfo with the sensor table info.
    //  Return the cached connection unless reload is true.
    //  Returns a promise.
    let metadata = null;
    let dbconfig = null;
    if (getDatabaseConfigPromise && !reload) {
      reuseCount += 1;
      return getDatabaseConfigPromise;
    }
    reuseCount = 0;
    getDatabaseConfigPromise = getMetadataConfig(req, metadataPrefix, metadataKeys)
      .then((res) => { metadata = res; })
      .then(() => {
        dbconfig = {
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
      })
      //  Read the column info for the sensordata table.
      .then(() => db(metadata.table).columnInfo())
      .then((res) => { tableInfo = res; })
      .then(() => dbconfig)
      .catch((error) => {
        sgcloud.log(req, 'getDatabaseConfig', { error });
        throw error;
      });
    return getDatabaseConfigPromise;
  }

  function throwError(err) {
    throw err;
  }

  function createTable(req) {
    //  Create the sensordata table if it doesn't exist.
    //  Returns a promise.
    let table = null;
    let id = null;
    let metadata = null;
    let result = null;
    return Promise.all([
      getDatabaseConfig(req).catch(throwError),
      getMetadataConfig(req).then((res) => { metadata = res; }).catch(throwError),
    ])
      .then(() => {
        table = metadata.table;
        id = metadata.id;
        sgcloud.log(req, 'createTable', { table, id });
        return db.schema.createTableIfNotExists(table, (tbl) => {
          //  Create each field found in sensorfields.
          const fields = sensorfields(tbl);
          for (const fieldName of Object.keys(fields)) {
            const field = fields[fieldName];
            const fieldTypeFunc = field[0];
            const fieldIndex = field[1];
            const fieldComment = field[2];
            if (!fieldTypeFunc) {
              const error = new Error(`Unknown field type for ${fieldName}`);
              sgcloud.error(req, 'createTable', { error });
              continue;
            }
            //  Invoke the column builder function.
            const col = fieldTypeFunc.bind(tbl)(fieldName);
            col.comment(fieldComment);
            //  If id field, set as primary field.
            if (fieldName === id) col.primary();
            if (fieldIndex) col.index();
          }
          //  Add the created_at and updated_at fields.
          tbl.timestamps(true, true);
        });
      })
      .then((res) => {
        result = res;
        sgcloud.log(req, 'createTable', { result, table, id });
      })
      //  Reload the table info.
      .then(() => getDatabaseConfig(req, true))
      .then(() => result)
      .catch((error) => {
        sgcloud.error(req, 'createTable', { error, table, id });
        throw error;
      });
  }

  function task(req, device, body0, msg) {
    //  Handle the Sigfox received by adding it to the sensordata table.
    //  Database connection settings are read from Google Compute Metadata.
    //  If the sensordata table is missing, it will be created.
    let metadata = null;
    let table = null;
    const body = Object.assign({}, body0);
    //  Create the KNEX database connection or return from cache.
    return Promise.all([
      getDatabaseConfig(req).catch(throwError),
      getMetadataConfig(req).then((res) => { metadata = res; }).catch(throwError),
    ])
      .then(() => {
        //  Create the sensordata table if it doesn't exist.
        if (tableInfo && Object.keys(tableInfo).length > 0) return 'OK';
        return createTable(req);
      })
      .then(() => {
        //  Create the record by calling KNEX library.
        table = metadata.table;
        //  Remove the fields that don't exist.
        for (const key of Object.keys(body)) {
          if (!tableInfo[key]) delete body[key];
        }
        //  Convert the timestamp field from number to text.
        if (body.timestamp) {
          body.timestamp = new Date(parseInt(body.timestamp, 10));
        }
        //  Insert the record.
        return db(table).insert(body);
      })
      .then(result => sgcloud.log(req, 'task', { result, device, body, table, reuseCount }))
      //  Return the message for the next processing step.
      .then(() => msg)
      .catch((error) => { sgcloud.log(req, 'task', { error, device, body, msg, table }); throw error; });
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
