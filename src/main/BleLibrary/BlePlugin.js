/**
 Copyright: Rently Keyless, 2019

 Author: Ron Gerbasi
 Date: April 2019
 */

"use strict";
var noble;
// const sleep = require('sleep');
const sleep = {
    msleep: (n) => {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, n);
}
};
const child_process = require('child_process');
const NobleWrapper = require('./BleNobleWrapper');
const BluetoothPluginInterface = require('blelocklibrary/plugins/BluetoothPluginInterface');
const Encryption = require('blelocklibrary/encryption');
const LockError = require('blelocklibrary/RNDahaoLockError');
const ResponseFactory = require('blelocklibrary/commands/responses/ResponseFactory');
const ResponseBuffer = require('blelocklibrary/commands/responses/ResponseBuffer');
const AddCardResponse = require('blelocklibrary/commands/responses/AddCardResponse');
const ServerEncryptedCommands = require("blelocklibrary/commands/ServerEncryptedCommand");
// const systemManager = require('../helpers/systemManager.js');

const BLE_COMM_ISSUE_REBOOT_TIME_IN_MS = 3 * 1000; // wait to complete shadow update before restart or reboot
const AES_KEY_BYTE_COUNT = 16;
const MAXIMUM_REBOOT_THRESHOLD_FOR_BLE_SCAN = 10;

let discoveryServices = false;
let connectionRetries = 10;
let retryConnectionDelay = 200;
let connectionTimeoutInterval = 7000;
let connectionTimeoutobject;
let lockAvailabilityTimeout = 7 * 1000; //7 seconds
let checkLockAvailabilityInterval = 30; // 30 miliseconds

// ble devices have MTU of 23 with 3 bytes being taken up by GATT header
// so we can only write 20 bytes at a time
const PACKET_SIZE = 20;
const StateEnum = {POWERED_OFF: 0, POWERED_ON: 1, WAITING_TO_SCAN: 2};
const DiscoveryServicesEnum = {NOT_FOUND: 0, FOUND: 1, COMMAND_TIMEOUT: 2};

const shallowSleep = (millis) => {
    return new Promise(resolve => setTimeout(resolve, millis));
};


/**
 *  BlePlugin implementation using noble
 *  since this is an interface, you don't need to extend it, but you do need to extend EventEmitter then
 */
class BlePlugin extends BluetoothPluginInterface {

    constructor() {
        super();

        this._activeDevices = new Map();
        this._state = StateEnum.POWERED_OFF;
        this._isScanInProgress = false;
        this.macList = [];
        this.serviceNotFoundErrCount = 0;
        this.BLE_ADAPTER_OFF_REBOOT_REQUIRED = 0x0FF;

        noble = NobleWrapper.getNoble();

        noble.on('stateChange', (state) => {
            if (state === 'poweredOn') {
                // not sure if sleep will potentially give
                // an opportunity for stopScan to come in with an edge case
                // so change state before doing it
                let doScan = (this._state === StateEnum.WAITING_TO_SCAN);
                this._state = StateEnum.POWERED_ON;

                // noble.reset();
                sleep.msleep(200);

                if (doScan) {
                    this._isScanInProgress = true;
                    this.startScanning();
                }
            }
            else if(state == "poweredOff"){
                this._state = StateEnum.POWERED_OFF;
            }
        });

        noble.on("discover", (peripheral) => {
            let rssi, manufacturerData;
            let lockMac = peripheral.address.toUpperCase();
            log('Device : ' + lockMac);
            this.macList.push(lockMac);
            if(peripheral.advertisement && peripheral.advertisement.manufacturerData)
                manufacturerData = parseManufacturerData(peripheral.advertisement.manufacturerData);
            if(peripheral.rssi) rssi = peripheral.rssi;

            let record = this._activeDevices.get(lockMac);

            if (peripheral.id && peripheral.advertisement && peripheral.advertisement.localName) {
                // no record of the lock yet so make one and send the foundDevice message

                let leDevice = {
                    deviceID: peripheral.id.slice(-8).toUpperCase(),
                    lockMac,
                    rssi,
                    name: peripheral.advertisement.localName.slice(0, 10),
                    lockType: 'V3Lock'
                };

                console.log(leDevice);
                console.log(manufacturerData);

                //TODO: need to add some way of pruning this map when devices no longer show up in a scan
                this._activeDevices.set(lockMac, {peripheral, info: {rssi,...manufacturerData}});

                // emit an new object with leDevice and the manufacturerDate combined
                this.emit('foundDevice', {...leDevice, ...manufacturerData});

            } else if(record) {
                // update the record with the latest broadcast info
                this._activeDevices.set(lockMac, {peripheral, info: {rssi,...manufacturerData}});
            }

        });
    }

    /**
     * Sets the service and characteristic UUIDs for the lock.  This should be set before scanning.
     *
     * @param serviceUUID {string} format is 'fee7'
     * @param characteristicUUID {string} format is 'fec6'
     */
    setServiceAndCharacteristicUUIDs(serviceUUID,characteristicUUID) {
        this._lockServiceUUIDs = [serviceUUID];
        this._lockCharsUUIDs = [characteristicUUID];
    }

    /**
     * Sets the header that will be at the start of a new response from the lock.
     *
     * @param notifyHeader {string} format is "55AA"
     */
    setNotifyHeader(notifyHeader) {
        this._notifyHeader = notifyHeader;
    }

    /**
     * Sets the AES key that will be used for encrypting and decrypting.
     *
     * @param aesKey {Buffer} hex buffer representation of the AES key
     */
    setAESKey(aesKey) {

        if ((aesKey instanceof Buffer) && (aesKey.length === AES_KEY_BYTE_COUNT)) {
            // clone the buffer
            this._aesKey = Buffer.concat([aesKey]);
        } else {
            console.log("Malformed AES key.");
        }
    }

    /**
     * Starts a bluetooth device scan.  The scan should produce single event notifies with no repeats.
     */
    startScan() {
        log("startScanning");
        this._state = StateEnum.WAITING_TO_SCAN
        if (this._state === StateEnum.POWERED_OFF) {
            log("bluetooth not ready, deferring scan");

            // wait for the hub to update shadow
            //  if(this.serviceNotFoundErrCount >= MAXIMUM_REBOOT_THRESHOLD_FOR_BLE_SCAN) { // Comment added to prevent the reboot at the initial start of the hub to give the time to bring the hci0 interface up
            //     noble.reset();
            //     setTimeout(() => { systemManager.reboot('ok_BLE_adapter_power_off_state'); }, BLE_COMM_ISSUE_REBOOT_TIME_IN_MS);
            // }
            // noble.reset();

            this.serviceNotFoundErrCount++;

            this._state = StateEnum.WAITING_TO_SCAN;
        } else {
            this._isScanInProgress = true;
            noble.startScanning(this._lockServiceUUIDs, false, (error) => {
                if (error) {
                    log(error);
                    this.serviceNotFoundErrCount = this.BLE_ADAPTER_OFF_REBOOT_REQUIRED;
                }
            });
        }
    }

    /**
     * Stop the bluetooth device scan.
     */
    stopScan() {
        log("stop scanning");
        // if you were still waiting to scan, then you were not powered on yet, so set to powered off
        if (this._state === StateEnum.WAITING_TO_SCAN) this._state = StateEnum.POWERED_OFF;

        this._isScanInProgress = false;
        noble.stopScanning();
    }

    /**
     * Disconnect the device.
     *
     * @param lockMac {string} mac of the lock with format "FB:FB:CD:BF:27:FF"
     */
    disconnectDevice(lockMac) {
        log("disconnecting device");

        let peripheral = this._activeDevices.get(lockMac).peripheral;

        peripheral.disconnect();

    }

    /**
     * A bluetooth command has timed out (from the libraries perspective).
     *
     * @param lockMac {string} mac of the lock with format "FB:FB:CD:BF:27:FF"
     */
    commandTimeOut(lockMac) {
        discoveryServices = DiscoveryServicesEnum.COMMAND_TIMEOUT;
        log("command timed out so disconnecting the device");
        this.disconnectDevice(lockMac);
    }

    /**
     * Get the broadcast info of the lock.
     *
     * @param lockMac {string} mac of the lock with format "FB:FB:CD:BF:27:FF"
     * @returns {Promise<Object>}
     */
    async getLockBroadcastInfo(lockMac) {
        return this._activeDevices.get(lockMac).info;
    }

    async findLockMac(lockMac){
        let lockFound = false;

        if(this._isScanInProgress === false) {
            this.stopScan();
            this.macList = [];
            this.startScan();
        }

        for (let i=0; i<Number(lockAvailabilityTimeout/checkLockAvailabilityInterval); i++) {
            await shallowSleep(checkLockAvailabilityInterval);
            if (this.macList.includes(lockMac)){
                lockFound = true;
                this.stopScan();
                break;
            }
        }

        if(lockFound === false) {
            this.stopScan();
        }
        return lockFound;
    }


    async writeToDevice(lockMac, command) {
        let response,startTime = 0,endTime = 0, timeDiff = 0,cmdBuffer;
        startTime = Math.floor(Date.now() / 1000);
        let lockFound = await this.findLockMac(lockMac);
        if (!lockFound) {
            //check
            throw createErrorWithCode(LockError.METHOD_ERR_DEVICE_NOT_CONN);
        }

        let updateCmdBuffer = command.buffer;
        for(let index=0; index<connectionRetries; index++){
            try {
                let response;
                const isServerEncryptedCommand = command instanceof ServerEncryptedCommands;
                if (isServerEncryptedCommand) {
                    updateCmdBuffer.isServerCommand = true;
                    response = await this.writeToDeviceRetry(lockMac, updateCmdBuffer);
                    this.serviceNotFoundErrCount = 0;
                    return response;
                }
                endTime = Math.floor(Date.now() / 1000);
                timeDiff = endTime-startTime;
                timeDiff = timeDiff > 25 ? 25 : (timeDiff < 0 ? 0 : timeDiff); //capped to 25 sec of library command timed out duration
                console.log("Time difference ==",timeDiff);
                //cmdBuffer = updateTimebynSeconds(command.buffer, timeDiff);
                cmdBuffer = updateTimebynSeconds(updateCmdBuffer, timeDiff);
                startTime = Math.floor(Date.now() / 1000);
                response = await this.writeToDeviceRetry(lockMac, cmdBuffer);
                this.serviceNotFoundErrCount = 0;
                return response;
            } catch (error) {
                response = error;
                if (discoveryServices === DiscoveryServicesEnum.FOUND) {
                    // After command timeout, ACL connection is still persisting
                    if (response && response.message === "No response to the command") {
                        //	throw createErrorWithCode(LockError.METHOD_ERR_DEVICE_NOT_CONN);
                        // retry continue till command timeout from library;
                    } else {
                        await sleep.msleep(200);
                        this.serviceNotFoundErrCount = 0;
                        throw response;
                    }
                }
            }
            await sleep.msleep(retryConnectionDelay);
            if(discoveryServices === DiscoveryServicesEnum.COMMAND_TIMEOUT)
            {
                break;
            }
            updateCmdBuffer = cmdBuffer;
        }
        // If new error code added in library for "connection cannot be established",
        // we can use it to replace current error code

        //noble reset
        this.serviceNotFoundErrCount++;
        throw createErrorWithCode(LockError.DHBLE_RESULT_SERVICE_NOT_FOUND);
    }

    /**
     *
     * Write to the device on the already specified characteristic.  This write is wrapped in a
     * Promise and should only resolve() after the corresponding notify(s) have occurred and are coalesced
     * into a single Buffer object that is run through ResponseFactory to create a Response object.
     *
     * @param lockMac {string} mac of the lock with format "FB:FB:CD:BF:27:FF"
     * @param command {Command} unencrypted buffer of bytes representing a command
     * @returns {Promise<Response>} response from the lock wrapped in a promise
     */
    async writeToDeviceRetry(lockMac, command) {
        discoveryServices = DiscoveryServicesEnum.NOT_FOUND;
        let peripheral = this._activeDevices.get(lockMac).peripheral;
        if (peripheral === undefined) return Promise.reject(createErrorWithCode(LockError.ACTIVE_DEVICE_ERR));

        return new Promise((resolve, reject) =>
        {
            let response = null;

            // changed to once, so the listeners dont keep getting added on top of each other
            peripheral.once('disconnect', function () {
                log('disconnected!');
                if (command.isServerCommand) {
                    return;
                } else if (response !== null) {
                    if (response.lockStatus!==0) {
                        reject(createErrorWithCode(response.lockStatus));
                    } else {
                        resolve(response);
                    }
                } else {
                    reject(new Error("No response to the command"));
                }
            });

            peripheral.connect(async (error) => {
                // On no connection, call disconnect after 7 seconds
                connectionTimeoutobject = setTimeout(() => {
                    if(discoveryServices === DiscoveryServicesEnum.NOT_FOUND) {
                        peripheral.disconnect();
                    }
                }, connectionTimeoutInterval);

                if (error) {
                    //peripheral.disconnect();
                    if(connectionTimeoutobject) {
                        clearTimeout(connectionTimeoutobject);
                    }
                    return reject(createErrorWithCode(LockError.METHOD_ERR_DEVICE_NOT_CONN));
                }

                peripheral.discoverServices(this._lockServiceUUIDs,  (error, services) => {

                    //log("services: " + services);
                    if (error || services.length===0) {
                        peripheral.disconnect();
                        if(connectionTimeoutobject) {
                            clearTimeout(connectionTimeoutobject);
                        }
                        reject(createErrorWithCode(LockError.DHBLE_RESULT_SERVICE_NOT_FOUND));
                        return;
                    }
                    discoveryServices=DiscoveryServicesEnum.FOUND;

                    if(connectionTimeoutobject) {
                        clearTimeout(connectionTimeoutobject);
                    }

                    services[0].discoverCharacteristics(this._lockCharsUUIDs, (error, chars) => {
                        if (error || chars.length===0) {
                            reject(createErrorWithCode(LockError.DHBLE_RESULT_CHARACTERISTIC_NOT_FOUND));
                            peripheral.disconnect();
                            return;
                        }

                        let lockChar = chars[0];

                        let responseBuffer = null;

                        // this gets called on a data change to the characteristic
                        lockChar.on('data', (data, isNotification) => {

                            log("isNotification: " + isNotification);

                            //data should be a buffer
                            log("Notify buffer: " + data.toString('hex'));

                            //TODO: do we want to have another timeout here for how long we wait for a buffer notify?
                            // we already have timeout on the call, so it may not be necessary

                            try {
                                if (responseBuffer == null) {
                                    // no response so far so check for the header and the length
                                    let header = data.slice(0, 2).toString('hex').toUpperCase();

                                    if (header === this._notifyHeader) {
                                        let contentLength = data[2];
                                        responseBuffer = new ResponseBuffer(contentLength, data.slice(3));
                                    } else {
                                        throw(new Error("missing command header"));
                                    }

                                } else {
                                    responseBuffer.append(data);
                                }

                                if (responseBuffer.isComplete()) {
                                    if (command.isServerCommand) {
                                        const rawResponse = Buffer.concat([Buffer.from(this._notifyHeader, 'hex'), Buffer.from([responseBuffer.contentLength]), responseBuffer.buffer]);
                                        response = ResponseFactory.createServerCommandResponse(rawResponse);
                                        peripheral.disconnect();
                                        return resolve(response);
                                    }
                                    response = ResponseFactory.createResponse(this._aesKey, responseBuffer.buffer);
                                    if (response == null) {
                                        throw(new Error("response buffer is not valid."))
                                    }

                                    //logResponse(response);
                                    responseBuffer = null;
                                    if (response instanceof AddCardResponse && (response.lockStatus===0)) {
                                        // add card is the only command that requires a second response
                                        // for when the lock gets the card put in front of it after it's in
                                        // add card mode

                                        //do not disconnect, wait for another notify
                                        response = null;
                                        console.log("waiting for another notify");
                                    } else {
                                        //TODO: this is a somewhat naive connect/disconnect on every write call. is this what we want?
                                        peripheral.disconnect();
                                    }

                                } // else we are waiting on more notifies for the rest of the buffer
                            } catch(err) {
                                log(err.message);
                                if(response == null){
                                    reject(createErrorWithCode(LockError.DHBLE_RESULT_INCORRECT_CHECKSUM));
                                }
                                peripheral.disconnect();
                            }
                        });

                        // subscribe to the notify
                        lockChar.subscribe((error) => {
                            log("subscribing to lockChar");

                            // only do the write once the notify has been setup
                            try {
                                if (error) throw(new Error(error));
                                writeCommandToCharacteristic(this._aesKey, lockChar, command);
                            } catch(error) {
                                reject();
                                peripheral.disconnect();
                            }

                        });

                    });
                });
            });
        });
    }
}
function generateTime2Dev(d) {

    var yr = ('000000' + ((d.getUTCFullYear() - 2000)).toString(2)).slice(-6);
    var mo = ('0000' + ((d.getUTCMonth() + 1)).toString(2)).slice(-4);
    var dy = ('00000' + (d.getUTCDate()).toString(2)).slice(-5);
    var hr = ('00000' + (d.getUTCHours()).toString(2)).slice(-5);
    var mi = ('000000' + (d.getUTCMinutes()).toString(2)).slice(-6);
    var sc = ('000000' + d.getUTCSeconds().toString(2)).slice(-6);

    var date = yr + mo + dy + hr + mi + sc;

    return parseInt(date, 2).toString(16);

}

function getdecodedTime(s){

    const time = [s.slice(0,2), s.slice(2,4), s.slice(4,6), s.slice(6,8)]; //4eba0000
    console.log(time.map(i => parseInt(i, 16).toString(2)))
    const res = time.map(i => (Array(8).join('0') + parseInt(i, 16).toString(2)).slice(-8))

    const res1 = res.reduce((sum, i) => sum + i)

    const year = parseInt(res1.slice(0, 6), 2);
    const mon = parseInt(res1.slice(6, 10), 2);
    const day = parseInt(res1.slice(10, 15), 2);
    const hour = parseInt(res1.slice(15, 20), 2);
    const min = parseInt(res1.slice(20, 26), 2);
    const sec = parseInt(res1.slice(26, 32), 2);


    let date = new Date(Date.UTC('20'+year,mon-1,day,hour,min,sec))

    return date
}

function getChecksum(str) {
    let bytes = Buffer.from(str, 'hex');

    let checksum = 0;
    for (let i = 0; i < bytes.length; i++) {
        checksum = checksum ^ bytes[i];
    }
    return ('00' + checksum.toString(16)).slice(-2);
}
function updateTimebynSeconds(commandbuffer,seconds){
    try {

        let payload = Buffer.from(commandbuffer,'hex').toString('hex');
        let header = payload.slice(0,4);
        let content = payload.slice(6,-2);
        let length = payload.slice(4,6);
        let checksum = payload.slice(-2);
        let command = payload.slice(6,8);
        let commandTime = content.slice(-8);
        if(command.toUpperCase()=='7D'){
            commandTime = content.slice(-10,-2);
        }
        let decodedcommandTime = getdecodedTime(commandTime);
        let encodedUpdatedTime = generateTime2Dev(new Date(decodedcommandTime.getTime()+ seconds*1000))
        let newContent = content.replace(commandTime,encodedUpdatedTime);
        let newPayload = header+length+newContent+getChecksum(length+newContent)
        console.log("payload",payload)
        console.log("newPayload",newPayload)
        return Buffer.from(newPayload,'hex');
    } catch (error) {
        console.log(error)
        return commandbuffer;
    }
}

// private function
function writeCommandToCharacteristic(aesKey, lockChar,command) {
    let encryption = new Encryption(aesKey);
    let encData = command.isServerCommand ? command : encryption.encrypt(command);

    //loop based on PACKET_SIZE sized blocks
    let start = 0;
    let length = encData.length;

    let numOfPackets = Math.ceil(length / PACKET_SIZE);

    console.log("numOfPackets: " + numOfPackets);

    for (let i = 0; i < numOfPackets; i++) {

        // TODO: this mimics the hacky timers that ios and java use. waiting on write finish would be better
        // sleep between writes to make sure write goes through
        if (i > 0) sleep.msleep(200);

        // slice will stop when end of the buffer is reached, regardless of the PACKET_SIZE
        let buffer = encData.slice(start, start + PACKET_SIZE);

        console.log(i + ": " + buffer.toString('hex'));

        lockChar.write(buffer, true, (err) => {
            log("lock write resp = " + err);
        });

        start += 20;

    }
}

function parseManufacturerData(data) {

    let dataObj = {};
    if (data) {
        dataObj.modelNum = ((data[2] >> 2) & 0xff);
        dataObj.hardwareVer = (((data[2] & 0x03) << 2) | ((data[3] >> 6) & 0xff));
        dataObj.firmwareVer = (data[3] & 0x3f);
        dataObj.specialValue = (data[4] & 0xff);
        dataObj.log50percentFullStatus = (((data[5] & 0xff) >> 4) & 0x01);
        dataObj.recordStatus = (((data[5] & 0xff) >> 3) & 0x01);
        dataObj.lockStatus = (((data[5] & 0xff) >> 2) & 0x01);
        dataObj.settingMode = !!+(((data[5] & 0xff) >> 1) & 0x01);
        dataObj.touch = !!+((data[5] & 0xff) & 0x01);
        dataObj.battery = data[6];
    }
    // we grab the mac elsewhere
    //dataObj.deviceMac = data.slice(7,13);

    return dataObj;

}

function createErrorWithCode(code) {

    let error = new Error("");
    error.code = code.toString();

    return error;

}

/**
 *
 * @param response {Response}
 */
function logResponse(response) {

    log("===========================================");
    log("===========================================");
    log("OPEN_LOCK is 1B");
    log("CLOSE_LOCK is 1C");
    log("SET_CLOCK is 7D");
    log("RESET_LOCK is 79");

    log("--------------------------");

    log("command: " + response.command.toString(16));
    log("lockId: " + response.lockId);
    log("lockStatus: " + response.lockStatus.toString(16));

    let errorList = ["DHBLE_RESULT_OK",
        "DHBLE_RESULT_NG",
        "DHBLE_RESULT_SYSTEM_ERROR",
        "DHBLE_RESULT_LOCK_ID_ERROR",
        "DHBLE_RESULT_PASSWORD_ERROR",
        "DHBLE_RESULT_TIMEOUT",
        "DHBLE_RESULT_NO_LOGIN",
        "DHBLE_RESULT_KEY_EXIST",
        "DHBLE_RESULT_KEY_FULL",
        "DHBLE_RESULT_KEY_EMPTY"];

    if (response.lockStatus<errorList.length) {
        log("code: " + errorList[response.lockStatus]);
    } else {
        log("code is not properly defined in iOS");
    }

    log("===========================================");
    log("===========================================");

}

function log(message) {
    const LOG_SUFFIX = "HUB BT => ";
    console.log(LOG_SUFFIX + message);
    //debug(LOG_SUFFIX + message);
}

module.exports = Object.freeze(BlePlugin);
