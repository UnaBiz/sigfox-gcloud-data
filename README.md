**sigfox-gcloud-ubidots** is a [`sigfox-gcloud`](https://www.npmjs.com/package/sigfox-gcloud) adapter for integrating Sigfox devices with Ubidots.
With `sigfox-gcloud-ubidots` you may **process and render sensor
data** from your Sigfox devices in real time, through the
**Ubidots and Google Cloud platforms.**  You may also configure
Ubidots alerts to notify you via email and SMS based on
the sensor data received.

`sigfox-gcloud` is an open-source software framework for building a
Sigfox server with Google Cloud Functions and Google Cloud PubSub 
message queues.  [Check out `sigfox-gcloud`](https://www.npmjs.com/package/sigfox-gcloud)

[<kbd><img src="https://storage.googleapis.com/unabiz-media/sigfox-gcloud/ubidots-dashboard.jpg" width="800"></kbd>](https://storage.googleapis.com/unabiz-media/sigfox-gcloud/ubidots-dashboard.png)

# Releases

- **Version 1.0.0** (11 Oct 2017): Supports **Google Cloud Trace** for tracing the Sigfox Callback processing time
  across Cloud Functions.  Supports **Google Cloud Debug** for capturing Node.js memory snapshots.
  Supports **Ubidots map visualisation** of Sigfox Geolocation and other geolocated sensor data points.

# Getting Started

For development we support Linux, MacOS and [Ubuntu on Windows 10](https://msdn.microsoft.com/en-us/commandline/wsl/about).
Open a command prompt and enter these commands to download the `sigfox-cloud-ubidots` source folder to your computer.  

```bash
git clone https://github.com/UnaBiz/sigfox-gcloud-ubidots.git
cd sigfox-gcloud-ubidots
```

If you're using Ubuntu on Windows 10, we recommend that you launch "Bash on Ubuntu on Windows" and enter the following
commands to download the source files into the folder `/mnt/c/sigfox-gcloud-ubidots`:

```bash
cd /mnt/c
git clone https://github.com/UnaBiz/sigfox-gcloud-ubidots.git
cd sigfox-gcloud-ubidots
```

That's because `/mnt/c/sigfox-gcloud-ubidots` under `bash` is a shortcut to `c:\sigfox-gcloud-ubidots` under Windows.  
So you could use Windows Explorer and other Windows tools to browse and edit files in the folder.
Remember to use a text editor like Visual Studio Code that can save files using 
the Linux line-ending convention (linefeed only: `\n`), 
instead of the Windows convention (carriage return + linefeed: `\r \n`).

Create a file named `config.json` in the `sigfox-gcloud-ubidots` folder 
with the contents below (replace `YOUR_UBIDOTS_API_KEY` by your 
[Ubidots API Key](https://ubidots.com/docs/api/#authentication))

```json
{
  "comment": "Configuration file for Ubidots adapter for sigfox-gcloud",
  "ubidots-api-key": "YOUR_UBIDOTS_API_KEY"
}
```

To use multiple Ubidots accounts, combine the API keys from each account with a comma:

```json
  "ubidots-api-key": "YOUR_UBIDOTS_API_KEY1,YOUR_UBIDOTS_API_KEY2"
```

### Setting up Google Cloud

1.  Install `sigfox-gcloud` with the base modules (exclude optional modules):

    https://github.com/UnaBiz/sigfox-gcloud/blob/master/README.md

1.  Add the following `sigfox-route` setting to the Google Cloud Project Metadata store.
    This route says that all received Sigfox messages will be processed by the
    two steps `decodeStructuredMessage` and `sendToUbidots`.

    ```bash
    gcloud compute project-info add-metadata --metadata=^:^sigfox-route=decodeStructuredMessage,sendToUbidots
    ```

1. Create the Google PubSub message queue that we will use to route the
   Sigfox messages between the Cloud Functions:
   
    ```bash
    gcloud beta pubsub topics create sigfox.types.sendToUbidots
    ```
    
    `sigfox.devices.sendToUbidots` is the queue that will receive decoded Sigfox messages
    to be sent to Ubidots via the Ubidots API   
    
1. Deploy all the included Cloud Functions (including the demo functions) with the `deployall.sh` script:

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
  decodeStructuredMessage, sendToUbidots
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
     `sendToUbidots` via the queue `sigfox.types.sendToUbidots`          

  1. `sendToUbidots` sends the decoded message to Ubidots by calling the Ubidots API.  
      It assumes that you have created a device in Ubidots that's named like
      `Sigfox Device 2C30EB`, where the last 6 letters/digits is the Sigfox device ID.
      
  1. `sendToUbidots` also assumes that you have created variables with the same name as the decoded message fields.
    For example if you're using this Arduino sketch to send structured sensor data to Sigfox:
    
      https://github.com/UnaBiz/unabiz-arduino/blob/0b8d20d5b94cbd8ae4453e72471e511a516b030e/examples/send-altitude-structured/send-altitude-structured.ino#L126-L136      
      ```arduino
      Message msg(transceiver);  //  Will contain the structured sensor data.
      msg.addField("tmp", scaledTemp);  //  4 bytes for the temperature (1 decimal place).
      msg.addField("hmd", scaledHumidity);  //  4 bytes for the humidity (1 decimal place).
      msg.addField("alt", scaledAltitude);  //  4 bytes for the altitude (1 decimal place).
      msg.send();  //  Send the structured sensor data.
      ```
      
      `sendToUbidots` assumes that you have created the variables named `tmp, hmd` and `alt` in your Ubidots device,
      e.g. `Sigfox Device 2C30EB`. `sendToUbidots` can then populate the `tmp, hmd` and `alt` variables through 
      the Ubidots API.
      
1.  See this doc for the definition of **Structured Messages:**

    https://unabiz.github.io/unashield/
    
    For instructions on creating the Ubidots devices and variables, check the **UnaShield Tutorial for Ubidots:**
    
    https://unabiz.github.io/unashield/ubidots    

### Viewing `sigfox-gcloud-ubidots` server logs

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

-   **`sendToUbidots`** is a Google Cloud Function that sends the decoded sensor data to Ubidots via the Ubidots API.

### Tracing `sigfox-gcloud-ubidots` server performance

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

### Understanding and troubleshooting the `sigfox-gcloud-ubidots` server

To understand each processing step in the `sigfox-gcloud-ubidots` server, you may use the
[Google Cloud Debug Console](https://console.cloud.google.com/debug)
to set breakpoints and capture in-memory variable values for each Google Cloud Function, without stopping or reconfiguring the server.

In the example below, we have set a breakpoint in the `sigfoxCallback` Google Cloud Function.  The captured in-memory
values are displayed at right - you can see the **Sigfox message** that was received by the callback.
The **Callback Stack** appears at the lower right.

Google Cloud Debug is also useful for troubleshooting your custom message processing code without having to insert the
debugging code yourself.

[<kbd><img src="https://storage.googleapis.com/unabiz-media/sigfox-gcloud/gcloud-debug.jpg" width="1024"></kbd>](https://storage.googleapis.com/unabiz-media/sigfox-gcloud/gcloud-debug.png)
        
### Testing the `sigfox-gcloud-ubidots` server

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

1. To send messages from a Sigfox device into Ubidots, you may use this Arduino sketch:

    https://github.com/UnaBiz/unabiz-arduino/blob/master/examples/send-light-level/send-light-level.ino
    
    The sketch sends 3 field names and field values, packed into a Structured Message:
        
    ```
    ctr - message counter
    lig - light level, based on the Grove analog light sensor
    tmp - module temperature, based on the Sigfox module's embedded temperature sensor        
    ```

1. In Ubidots, create the **Devices / Datasources** for each Sigfox device to be integrated with Ubidots.
    Name the device / datasource using this format: (change `2C30EB` to your Sigfox device ID)
    
    ```
    Sigfox Device 2C30EB
    ```

   [<kbd><img src="https://storage.googleapis.com/unabiz-media/sigfox-gcloud/ubidots-device-list.jpg" width="800"></kbd>](https://storage.googleapis.com/unabiz-media/sigfox-gcloud/ubidots-device-list.png)

1. For each Ubidots device / datasource, create the **Variables** that will be used to transmit
    sensor values from the Sigfox device to Ubidots.  For the above example, you may create 3 variables
    `ctr, lig, tmp` for the Ubidots device `Sigfox Device 2C30EB`.
    
    Run the above Arduino-Sigfox sketch and the sensor values will be automatically recorded by Ubidots under
    `Sigfox Device 2C30EB`.

    [<kbd><img src="https://storage.googleapis.com/unabiz-media/sigfox-gcloud/ubidots-device.jpg" width="800"></kbd>](https://storage.googleapis.com/unabiz-media/sigfox-gcloud/ubidots-device.png)
    
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
           
1. The test message sent above will be decoded and sent to Ubidots as 

    ```
    ctr (counter): 13
    lig (light level): 760
    tmp (temperature): 29        
    ```

1. For instructions on creating the Ubidots devices and variables, check the **UnaShield Tutorial for Ubidots:**
                                                    
   https://unabiz.github.io/unashield/ubidots    
   
# Sending latitude-longitude values to Ubidots

Some Sigfox devices transmit location data in the form of latitude-longitude
values, such as GPS trackers. Ubidots is capable of rendering such data points
into a map, but under these conditions:

1. The field names must be `lat` and `lng`
1. The fields must appear in the **Context Field** of the variable to be rendered.

Suppose your GPS tracker transmits latitude, longitude as well as temperature.
Then Ubidots expects the `lat` and `lng` fields to be present in the context
whenever the temperature value is transmitted to Ubidots.

The `sendToUbidots` step can be configured to send any latitude-longitude fields
as `lat` and `lng`.  In the `config.json` file that you have created above,
insert 2 lines for `lat` and `lng` like this: (note the comma after the API key)

```
{
  "comment": "Configuration file for Ubidots adapter for sigfox-gcloud",
  "ubidots-api-key": "YOUR_UBIDOTS_API_KEY",
  "lat": "deviceLat,geolocLat",
  "lng": "deviceLng,geolocLng"
}
```

Then deploy the configuration using the command:
```bash
scripts/deployall.sh
```

This configures `sendToUbidots` to look for any data fields named
`deviceLat` and `deviceLng`, and if found, duplicate the fields as `lat` and `lng`

Create variables named `lat` and `lng` for your Sigfox Device in Ubidots.
If your GPS tracker sends the fields `deviceLat` and `deviceLng`,
they will be rendered correctly in a Ubidots map, like below.

Multiple latitude-longitude field names may be specified in `config.json`.  In the example above,
`sendToUbidots` searches for the fields `deviceLat` and `deviceLng` first.
If the fields are not found, then it searches for `geolocLat` and `geolocLng`.

[<kbd><img src="https://storage.googleapis.com/unabiz-media/sigfox-gcloud/ubidots-dashboard.jpg" width="800"></kbd>](https://storage.googleapis.com/unabiz-media/sigfox-gcloud/ubidots-dashboard.png)

# Sending Sigfox Geolocation data to Ubidots

[Sigfox Geolocation](https://www.sigfox.com/en/sigfox-geolocation) is an optional service
provided by your Sigfox Operator that locates your Sigfox device by using
the Sigfox network signal data. The latitude-longitude data provided through
this service may be rendered in Ubidots by setting the **GEOLOC Callback**
as follows:

Log on to the **Sigfox Backend**<br>
https://backend.sigfox.com/

Click **"Device Type"** at the top menu.<br>
Click on your device type.

Click **"Callbacks"** in the left menu.<br>
Click **"New"** at top right.

Enter the callback details as follows:

  -  **Type**: <br>
      **`SERVICE, GEOLOC`**
  
  -  **Channel**: <br>
      **`URL`**
  
  -  **URL Pattern**: <br>
      `https://us-central1-myproject.cloudfunctions.net/sigfoxCallback`<br>
      Change `myproject` to your Google Cloud Project ID

  -  **Use HTTP Method**: <br>
      **`POST`**
      
  -  **Send SNI**: <br>
      **Checked (Yes)**

  -  **Headers**: <br>
      **(Blank)**

  -  **Content Type**: <br>
      **`application/json`**
          
  - Set the **Body** as:

      ```json
      {
        "time": {time},
        "action": "geoloc",
        "device" : "{device}",       
        "geolocLat": {lat},              
        "geolocLng": {lng},              
        "geolocLocationAccuracy": {radius},
        "seqNumber": {seqNumber},
        "duplicate": "{duplicate}",  
        "snr": "{snr}",              
        "station": "{station}",      
        "avgSnr": "{avgSnr}",     
        "rssi": "{rssi}"               
      }
      ```
      
      Note that the Sigfox Geolocation latitude and longitude fields
      will be transmitted as `geolocLat` and `geolocLng` with the above settings

[<kbd><img src="https://storage.googleapis.com/unabiz-media/sigfox-gcloud/sigfox-geoloc-detail.jpg" width="800"></kbd>](https://storage.googleapis.com/unabiz-media/sigfox-gcloud/sigfox-geoloc-detail.png)

Note that this is a different callback from the **Data Callback** that we
use for normal Sigfox messages.

After saving the callback you should see the Sigfox Geolocation callback
appear under the `SERVICE Callbacks` section, not `DATA Callbacks`.

[<kbd><img src="https://storage.googleapis.com/unabiz-media/sigfox-gcloud/sigfox-geoloc-list.jpg" width="800"></kbd>](https://storage.googleapis.com/unabiz-media/sigfox-gcloud/sigfox-geoloc-list.png)

Follow the instructions in the previous section to set `config.json` as

```
{
  "comment": "Configuration file for Ubidots adapter for sigfox-gcloud",
  "ubidots-api-key": "YOUR_UBIDOTS_API_KEY",
  "lat": "deviceLat,geolocLat",
  "lng": "deviceLng,geolocLng"
}
```
Then deploy the configuration using the command:
```bash
scripts/deployall.sh
```
Create variables named `lat`, `lng`, `geolocLat` and `geolocLng` for your Sigfox Device in Ubidots.

To verify that the Sigfox Geolocation data is transmitted correctly, 
click on the variable `geolocLat` for your Sigfox Device.

[<kbd><img src="https://storage.googleapis.com/unabiz-media/sigfox-gcloud/ubidots-geoloc.jpg" width="1024"></kbd>](https://storage.googleapis.com/unabiz-media/sigfox-gcloud/ubidots-geoloc.png)

You'll see that the `lat` field in the `Context` column shows the same value
as the `geolocLat` field in the left column.  Which means that `sendToUbidots`
has correctly copied the `geolocLat` field into `lat`.

Check the same for `geolocLng` and `lng` fields. 

Now that the `lat` and `lng` fields are properly populated, we will see the
Sigfox Geolocation points on the Ubidots map.

[<kbd><img src="https://storage.googleapis.com/unabiz-media/sigfox-gcloud/ubidots-dashboard.jpg" width="800"></kbd>](https://storage.googleapis.com/unabiz-media/sigfox-gcloud/ubidots-dashboard.png)
