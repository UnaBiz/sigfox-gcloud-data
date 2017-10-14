**sigfox-gcloud-data** is a [`sigfox-gcloud`](https://www.npmjs.com/package/sigfox-gcloud) 
adapter for writing Sigfox messages into SQL databases like MySQL and Postgres.

You may read and update Sigfox messages with other modules (such as 
[`sigfox-gcloud-ubidots`](https://www.npmjs.com/package/sigfox-gcloud-ubidots))
before passing to `sigfox-gcloud-data` for writing to the database.
`sigfox-gcloud-data` works with most SQL databases supported by 
[Knex.js](http://knexjs.org/)
like **MySQL, Postgres, MSSQL, MariaDB and Oracle.**

`sigfox-gcloud-data` was built with `sigfox-gcloud`, an open-source software framework for building a
Sigfox server with Google Cloud Functions and Google Cloud PubSub 
message queues.  [Check out `sigfox-gcloud`](https://www.npmjs.com/package/sigfox-gcloud)

_`sigfox-gcloud-data` with MySQL:_<br>
[<kbd><img src="https://storage.googleapis.com/unabiz-media/sigfox-gcloud/data-mysql.png" width="800"></kbd>](https://storage.googleapis.com/unabiz-media/sigfox-gcloud/data-mysql.png)

_`sigfox-gcloud-data` with Postgres:_<br>
[<kbd><img src="https://storage.googleapis.com/unabiz-media/sigfox-gcloud/data-postgres.jpg" width="800"></kbd>](https://storage.googleapis.com/unabiz-media/sigfox-gcloud/data-postgres.png)

# Releases

- **Version 1.0.1** (14 Oct 2017): Supports multiple instances

# Getting Started

For development we support Linux, MacOS and [Ubuntu on Windows 10](https://msdn.microsoft.com/en-us/commandline/wsl/about).
Open a command prompt and enter these commands to download the `sigfox-cloud-data` source folder to your computer.  

```bash
git clone https://github.com/UnaBiz/sigfox-gcloud-data.git
cd sigfox-gcloud-data
```

If you're using Ubuntu on Windows 10, we recommend that you launch "Bash on Ubuntu on Windows" and enter the following
commands to download the source files into the folder `/mnt/c/sigfox-gcloud-data`:

```bash
cd /mnt/c
git clone https://github.com/UnaBiz/sigfox-gcloud-data.git
cd sigfox-gcloud-data
```

That's because `/mnt/c/sigfox-gcloud-data` under `bash` is a shortcut to `c:\sigfox-gcloud-data` under Windows.  
So you could use Windows Explorer and other Windows tools to browse and edit files in the folder.
Remember to use a text editor like Visual Studio Code that can save files using 
the Linux line-ending convention (linefeed only: `\n`), 
instead of the Windows convention (carriage return + linefeed: `\r \n`).

### Setting up Google Cloud

1.  Install `sigfox-gcloud` with the base modules (exclude optional modules):

    https://github.com/UnaBiz/sigfox-gcloud/blob/master/README.md

1. Open a bash command prompt.  For Windows, open "Bash on Ubuntu on Windows."  
    Create a file named `.env` in the `sigfox-gcloud-data` folder  
    and populate the `GCLOUD_PROJECT` variable with your project ID.
     To do that, you may use this command (change `myproject` to your project ID):

    ```bash
    cd sigfox-gcloud-data
    echo GCLOUD_PROJECT=myproject >.env
    ```

1.  Add the following `sigfox-route` setting to the Google Cloud Project Metadata store.
    This route says that all received Sigfox messages will be processed by the
    two steps `decodeStructuredMessage` and `sendToDatabase`.

    ```bash
    gcloud compute project-info add-metadata --metadata=^:^sigfox-route=decodeStructuredMessage,sendToDatabase
    ```
    
    If you're using `sigfox-gcloud-ubidots`, the `sendToDatabase` step should appear
    last so that the updates from `sendToUbidots` will be recorded in the database.

    ```bash
    gcloud compute project-info add-metadata --metadata=^:^sigfox-route=decodeStructuredMessage,sendToUbidots,sendToDatabase
    ```

1. Create the Google PubSub message queue that we will use to route the
   Sigfox messages between the Cloud Functions:
   
    ```bash
    gcloud beta pubsub topics create sigfox.types.sendToDatabase
    ```
    
    `sigfox.devices.sendToDatabase` is the queue that will receive decoded Sigfox messages
    to be sent to data via the data API   

1. Go to the Google Cloud Metadata screen to define your database settings:

    https://console.cloud.google.com/compute/metadata
    
    [<kbd><img src="https://storage.googleapis.com/unabiz-media/sigfox-gcloud/data-metadata.png" width="640"></kbd>](https://storage.googleapis.com/unabiz-media/sigfox-gcloud/data-metadata.png)

    - `sigfox-dbclient`: Database client library to be used e.g `mysql`, `pg`. 
    Check this page for the library: http://knexjs.org/#Installation-node
    - `sigfox-dbhost`: Address of database server e.g. `127.127.127.127`
    - `sigfox-dbuser`: User ID for accessing the database e.g. `user`
    - `sigfox-dbpassword`: Password for accessing the database.
    - `sigfox-dbname`: Name of the database that will store the sensor data. Defaults to `sigfox`
    - `sigfox-dbtable`: Name of the table to store sensor data. Defaults to `sensordata`
    - `sigfox-dbversion`: Version number of database, used only by Postgres, e.g. `7.2`

    If the `sigfox-dbtable` table above does not exist, it will be created automatically.

1. Install the database library if you are NOT using MySQL or Postgres.
    Check this page for the library to be used:
    
    http://knexjs.org/#Installation-node
    
    Then run the command `npm install LIBRARYNAME --save`.  For example if you're using MSSQL, you would
    run this command:
    
    ```bash
    npm install mssql --save
    ```
    
1. Deploy the `sendToDatabase` Cloud Function with the `deployall.sh` script:

    ```bash
    chmod +x */*.sh
    scripts/deployall.sh
    ```

### How it works

[<kbd><img src="https://storage.googleapis.com/unabiz-media/sigfox-gcloud/sigfox-gcloud-arch.svg" width="1024"></kbd>](https://storage.googleapis.com/unabiz-media/sigfox-gcloud/sigfox-gcloud-arch.svg)

  1. Sigfox messages are pushed by the Sigfox Cloud to the Google Cloud Function
  [`sigfoxCallback`](https://github.com/UnaBiz/sigfox-gcloud/tree/master/sigfoxCallback)          
  
  1. Cloud Function `sigfoxCallback` delivers the message to PubSub message queue
    `sigfox.devices.all`, as well as to the device ID and device type queues
  
  1. Cloud Function 
    [`routeMessage`](https://github.com/UnaBiz/sigfox-gcloud/tree/master/routeMessage)
    listens to PubSub message queue 
    `sigfox.devices.all` and picks up the new message
  
  1. Cloud Function `routeMessage` assigns a route to the 
    Sigfox message by reading the `sigfox-route` from the Google Compute Metadata Store. 
    The route looks like this: 

  ```
  decodeStructuredMessage, sendToDatabase
  ```

  1. This route first sends the message to function `decodeStructuredMessage` 
    via the queue `sigfox.types.decodeStructuredMessage`
    
  1. `decodeStructuredMessage` contains the logic to decode a compressed message format that we call 
    **Structured Message Format**.  Within a 12-byte Sigfox message, the Structured Message Format
     can encode efficiently 3 sensor field values and their sensor field names.
     
     For example, the encoded 12-byte message<br>
        `b0513801a421f0019405a500`<br>
     contains 3 sensor values (temperature, humidity, altitude) and their field names:<br>
        `tmp = 31.2, hmd = 49.6, alt = 16.5`       
             
  1.  According to `sigfox-route` above, the resulting decoded message is sent next to function 
     `sendToDatabase` via the queue `sigfox.types.sendToDatabase`          

  1. `sendToDatabase` appends the received Sigfox message to the `sensordata` table
      that you have defined in the Google Cloud Metadata settings.   It calls the
      [Knex.js](http://knexjs.org/) library to update the database.                                                                
      
  1. `sendToDatabase` automatically matches the received Sigfox message fields with the `sensordata` fields.
      So if your Sigfox message includes a new field (perhaps by decoding a Structured Message)
      and the `sensordata` table also contains a field by that name, `sendToDatabase`
      will write the new field into the `sensordata` table.
       
1.  See this doc for the definition of **Structured Messages:**

    https://unabiz.github.io/unashield/
    
    To understand how Structured Messages may be used with the Ubidots IoT platform, check the **UnaShield Tutorial for Ubidots:**
    
    https://unabiz.github.io/unashield/ubidots    

### Viewing `sigfox-gcloud-data` server logs

You may view the logs through the
[Google Cloud Logging Console](https://console.cloud.google.com/logs/viewer?resource=cloud_function&minLogLevel=0&expandAll=false)  
Select **"Cloud Function"** as the **"Resource"**
        
[<kbd><img src="https://storage.googleapis.com/unabiz-media/sigfox-gcloud/gcloud-log2.jpg" width="1024"></kbd>](https://storage.googleapis.com/unabiz-media/sigfox-gcloud/gcloud-log2.png)
    
From the screen above you can see the logs generated as each Sigfox message is processed in stages by `sigfox-gcloud`:

-   **Sigfox Device IDs** are shown in square brackets e.g. `[ 2C30EB ]`

-   **Completed Steps** are denoted by `_<<_`

-   **`sigfoxCallback`** is the Google Cloud Function that listens for incoming HTTPS messages delivered by Sigfox

-   **`routeMessage`** passes the Sigfox message to various Google Cloud Functions to decode and process the message

-   **`decodeStructuredMessage`** decodes a compressed Sigfox message that contains multiple field names and field values

-   **`sendToDatabase`** would appear after `decodeStructuredMessage`.
    `sendToDatabase` writes the decoded sensor data to the database via the
    [Knex.js](http://knexjs.org/) library.

### Tracing `sigfox-gcloud-data` server performance

The
[Google Cloud Trace Console](https://console.cloud.google.com/traces/traces)
shows you the time taken by each step of the Sigfox message processing pipeline, tracing the message through every Google Cloud Function.

[<kbd><img src="https://storage.googleapis.com/unabiz-media/sigfox-gcloud/gcloud-trace.jpg" width="1024"></kbd>](https://storage.googleapis.com/unabiz-media/sigfox-gcloud/gcloud-trace.png)

Each message delivered by Sigfox appears as a separate trace timeline.  Messages are shown like `2C30EB seq:1913`
where `2C30EB` is the **Sigfox Device ID** and `1913` is the **Sigfox Message Sequence Number (seqNumber)**

The Google Stackdriver Trace API needs to be [enabled manually](https://console.cloud.google.com/apis/library/cloudtrace.googleapis.com/?q=trace&project=iteunabiz&organizationId=300017972478).

Custom reports may be created in Google Cloud Trace Control to benchmark the performance of each processing step over time.

[<kbd><img src="https://storage.googleapis.com/unabiz-media/sigfox-gcloud/gcloud-report-detail.jpg" width="1024"></kbd>](https://storage.googleapis.com/unabiz-media/sigfox-gcloud/gcloud-report-detail.png)

[<kbd><img src="https://storage.googleapis.com/unabiz-media/sigfox-gcloud/gcloud-trace-overview.jpg" width="800"></kbd>](https://storage.googleapis.com/unabiz-media/sigfox-gcloud/gcloud-trace-overview.png)

[<kbd><img src="https://storage.googleapis.com/unabiz-media/sigfox-gcloud/gcloud-trace-report.jpg" width="400"></kbd>](https://storage.googleapis.com/unabiz-media/sigfox-gcloud/gcloud-trace-report.png)

### Understanding and troubleshooting the `sigfox-gcloud-data` server

To understand each processing step in the `sigfox-gcloud-data` server, you may use the
[Google Cloud Debug Console](https://console.cloud.google.com/debug)
to set breakpoints and capture in-memory variable values for each Google Cloud Function, without stopping or reconfiguring the server.

In the example below, we have set a breakpoint in the `sigfoxCallback` Google Cloud Function.  The captured in-memory
values are displayed at right - you can see the **Sigfox message** that was received by the callback.
The **Callback Stack** appears at the lower right.

Google Cloud Debug is also useful for troubleshooting your custom message processing code without having to insert the
debugging code yourself.

[<kbd><img src="https://storage.googleapis.com/unabiz-media/sigfox-gcloud/gcloud-debug.jpg" width="1024"></kbd>](https://storage.googleapis.com/unabiz-media/sigfox-gcloud/gcloud-debug.png)
        
### Testing the `sigfox-gcloud-data` server

1.  Send some Sigfox messages from the Sigfox devices. Monitor the progress
    of the processing through the 
    [Google Cloud Logging Console.](https://console.cloud.google.com/logs/viewer?resource=cloud_function&minLogLevel=0&expandAll=false)  
    Select **"Cloud Function"** as the **"Resource"**
        
    [<kbd><img src="https://storage.googleapis.com/unabiz-media/sigfox-gcloud/gcloud-log2.jpg" width="1024"></kbd>](https://storage.googleapis.com/unabiz-media/sigfox-gcloud/gcloud-log2.png)
        
1.  Processing errors will be reported to the 
    [Google Cloud Error Reporting Console.](https://console.cloud.google.com/errors?time=P1D&filter&order=COUNT_DESC)
            
    [<kbd><img src="https://storage.googleapis.com/unabiz-media/sigfox-gcloud/gcloud-error-reporting.png" width="1024"></kbd>](https://storage.googleapis.com/unabiz-media/sigfox-gcloud/gcloud-error-reporting.png)
    
1.  We may configure 
    [Google Cloud Stackdriver Monitoring](https://app.google.stackdriver.com/services/cloud_pubsub/topics) 
    to create incident
    reports upon detecting any errors.  Stackdriver may also be used to
    generate dashboards for monitoring the PubSub message processing queues.       
    
    [<kbd><img src="https://storage.googleapis.com/unabiz-media/sigfox-gcloud/gcloud-stackdriver.png" width="1024"></kbd>](https://storage.googleapis.com/unabiz-media/sigfox-gcloud/gcloud-stackdriver.png)

#  Demo    

1. To send messages from a Sigfox device into your database, you may use this Arduino sketch:

    https://github.com/UnaBiz/unabiz-arduino/blob/master/examples/send-light-level/send-light-level.ino
    
    The sketch sends 3 field names and field values, packed into a Structured Message:
        
    ```
    ctr - message counter
    lig - light level, based on the Grove analog light sensor
    tmp - module temperature, based on the Sigfox module's embedded temperature sensor        
    ```

1. Alternatively, you may test by sending a Sigfox message
    from your Sigfox device with the `data` field set to:

    ```
    920e82002731b01db0512201
    ```
   
   We may also use a URL testing tool like Postman to send a POST request to the `sigfoxCallback` URL e.g.
   (change `myproject` to your Google Cloud Project ID)
      
   `https://us-central1-myproject.cloudfunctions.net/sigfoxCallback`

   Set the `Content-Type` header to `application/json`. 
   If you're using Postman, click `Body` -> `Raw` -> `JSON (application/json)`
   Set the body to:
   
    ```json
    {
      "device":"1A2345",
      "data":"920e82002731b01db0512201",
      "time":"1476980426",
      "duplicate":"false",
      "snr":"18.86",
      "station":"0000",
      "avgSnr":"15.54",
      "lat":"1",
      "lng":"104",
      "rssi":"-123.00",
      "seqNumber":"1492",
      "ack":"false",
      "longPolling":"false"
    }
    ```
    where `device` is your Sigfox device ID.
    
    Here's the request in Postman:
    
     [<kbd><img src="https://storage.googleapis.com/unabiz-media/sigfox-gcloud/postman-callback.png" width="1024"></kbd>](https://storage.googleapis.com/unabiz-media/sigfox-gcloud/postman-callback.png)
     
    We may use the `curl` command as well.  Remember to change `myproject` and `1A2345`
    to your project ID and device ID.

    ```bash
    curl --request POST \
      --url https://us-central1-myproject.cloudfunctions.net/sigfoxCallback \
      --header 'cache-control: no-cache' \
      --header 'content-type: application/json' \
      --data '{"device":"1A2345", "data":"920e82002731b01db0512201", "time":"1476980426", "duplicate":"false", "snr":"18.86", "station":"0000", "avgSnr":"15.54", "lat":"1", "lng":"104", "rssi":"-123.00", "seqNumber":"1492", "ack":"false", "longPolling":"false"}'
    ```
    
1.  The response from the callback function should look like this:
    
    ```json
    {
      "1A2345": {
        "noData": true
      }
    }
    ```
           
1. The test message sent above will be decoded and written to your `sensordata` 
    table as 

    ```
    ctr (counter): 13
    lig (light level): 760
    tmp (temperature): 29        
    ```
    
    The other fields of the Sigfox message will be written as well.

# Adding one or more instances of `sendToDatabase`

It's possible to run 2 or more Cloud Functions that will update different databases.
The Cloud Functions should be named:

```
sendToDatabase, sendToDatabase2, sendToDatabase3, ...
```

and the configuration for each function shall be set in the [Google Cloud Metadata](https://console.cloud.google.com/compute/metadata) 
screen as

```
sigfox-dbclient, sigfox-dbclient2, sigfox-dbclient3, ...
``` 

For example, this metadata screen defines 2 databases settings for MySQL and Postgres:

[<kbd><img src="https://storage.googleapis.com/unabiz-media/sigfox-gcloud/data-metadata2.png" width="640"></kbd>](https://storage.googleapis.com/unabiz-media/sigfox-gcloud/data-metadata2.png)

To deploy the second instance of `sendToDatabase`, edit the script `scripts/deploy.sh` 
and uncomment the second `functiondeploy` so it looks like:

```bash
./scripts/functiondeploy.sh ${name}2  ${localpath} ${trigger} ${topic}
```

Run `scripts/deploy.sh`.  This will deploy a new function `sendToDatabase2` that uses the second database setting
in the Google Cloud Metadata screen.

To deploy `sendToDatabase3`, `sendToDatabase4`, ... you may edit `scripts/deploy.sh` accordingly:

```bash
./scripts/functiondeploy.sh ${name}3  ${localpath} ${trigger} ${topic}
./scripts/functiondeploy.sh ${name}4  ${localpath} ${trigger} ${topic}
```

Note that all instances of `sendToDatabase` will read Sigfox messages from the `sigfox.types.sendToDatabase` queue simultaneously.
The database updates will run in parallel.
