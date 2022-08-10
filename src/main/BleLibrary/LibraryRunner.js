/**
    Copyright: Rently Keyless, 2019

    Author: Ron Gerbasi
    Date: April 2019
 */

"use strict";

//TODO: this is a hack fix for timezone until it is properly set in the linux system
// process.env.TZ = 'America/New_York';
process.env.TZ = 'America/Los_Angeles';

// const TIMEZONE_STR = 'Eastern Time (US & Canada)';
const TIMEZONE_STR = 'Pacific Time (US & Canada)';

const OaksBleLockLibrary = require("blelocklibrary");
const axios = require('axios');
const EventEmitter = require('events');
const BlePlugin = require('./BlePlugin');
const PersistencePlugin = require('./PersistencePlugin');
const blueURL = "https://api.rentlyopensesame.com/oakslock/";

const {NotificationTypeEnum} = require('blelocklibrary/NotificationConstants');

const hardcodedMac = "CD:AC:96:45:B2:24";//"CD:AC:96:45:B2:24";

const interceptRequest = async ({ method, url, headers = {}, params = {}, ...rest }) => {
    const config = {
        url,
        method,
        params,
        headers,
        ...rest,
    };
    //console.log(`==== Demo: [${method}](${config.baseURL}${url})(${JSON.stringify(params)}) ----`);
    console.log(`---- lib:[${method}]:(${config.baseURL}${url}) \n(${JSON.stringify(params)}) \n`);
    // if (!config.headers.Authorization) {
    //     console.log("No authorization in header");
    //     //return;
    // }
    return config;
};

axios.defaults.timeout = 10000;
axios.interceptors.request.use(interceptRequest);

let globalAccessToken = '"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJwYXJ0bmVySWQiOjEsImRldmljZU1hYyI6IkY1OkM0OkVGOkRFOkQ4Ojk0Iiwicm9sZSI6IkFETUlOIiwiaWF0IjoxNTk3NDk2NDM2LCJleHAiOjE1OTc1ODI4MzZ9.QSiggszbIdVkHMo49PjVeMcM01aHOTttFt6igPEKWR0';
let validity = 1;

const blueLogin = async (username, password) => {
    try {
        axios.defaults.baseURL = blueURL;
        const url = 'token/login';
        const response = await axios.post(url, {clientId: username, clientSecret: password});
        //console.log('==== login response : ', response.statusText);
        console.log('==== login response : ', response.data);
        if(response.data){
            const {
                data: {token: {accessToken, expiresAt} = {}} = {},
            } = response;
            globalAccessToken = accessToken;
            return {token: `Bearer ${globalAccessToken}`, hostUrl: blueURL}
        } else {
            throw new Error('Login failed');
        }
    } catch (err) {
        return {message: err.message};
    }
};

const getDeviceToken = (mac, role) => {
    const URL = `token/getDeviceJwtToken?deviceMac=${mac}&role=${role}&validity=${validity}`;
    return new Promise((resolve, reject) => {
        axios({
            method: 'get',
            headers: {'Authorization': `Bearer ${globalAccessToken}`},
            url: URL,
        })
            .then((response) => {
                if (response.data && response.data.token ) {
                    resolve(response.data.token);
                } else {
                    reject(new Error('token not found'));
                }
            })
            .catch((error) => {
                reject(error)
            });
    })
};

const getDeviceList = () => {

    const URL = `device/getDeviceList`;
    return axios({
        method: 'get',
        headers: {'Authorization': `Bearer ${globalAccessToken}`},
        url: URL,
    })
        .then((response) => {
            return Promise.resolve(response.data);
        })
        .catch(error => {
            return Promise.reject(error);
        });
};

const getFobList = (lockMac,deviceToken) => {

    const URL = `fobs?lockMac=${lockMac}`;
    return axios({
        method: 'get',
        headers: {'Authorization': `Bearer ${deviceToken}`},
        url: URL,
    })
        .then((response) => {
            return Promise.resolve(response.data);
        })
        .catch(error => {
            return Promise.reject(error);
        });
};

/**
 * This is a temp class that is used for running the library.
 *
 * Ultimately, we will access the library through the hub codebase acting on a server call.
 *
 * This class SHOULD NOT be extended or used directly. It is only a reference for how to use the OaksBleLockLibrary.
 *
 * The implementation of using the library should be done in a different class by the assigned engineer.
 */
class LibraryRunner extends EventEmitter{

    constructor() {
        super();
        this._blePlugin = new BlePlugin();
        this._persistencePlugin = new PersistencePlugin();

        // make all the tests
        this.makeTests();

        let args = process.argv.slice(2);

        //TODO: add your commands here, DONT USE () after the name!
        let commandList = [this.packetLossCheck];
        //let commandList = [this.unlock];
        this.devices = [];
        let tests = new Map();

        // if (args.length===0) {
            tests.set("manual test", commandList);
        // } else {
        //     if (args[0]==="allTests") {
        //         tests = this._tests;
        //     } else {
        //         let test = this._tests.get(args[0]);
        //         if (test) {
        //             tests.set(args[0],test);
        //         } else {
        //             tests.set("empty test",[]);
        //         }
        //     }
        // }

        this.getToken = async (lockMac) => {
            try {
                return await getDeviceToken(lockMac, "ADMIN");
            } catch (error) {
                return error;
            }
        };

        this.foundDevice = async device => {

            const {lockMac,settingMode=false,touch=false,battery=100,rssi,...rest} = device;

            const lockData = {
                lockMac,
                settingMode,
                touch,
                battery,
                rssi,
                ...rest
            };

            // if you have a hardcoded mac then ignore all other macs for found devices
            if (this.createdDevice) return;
            this.devices.push(this.library.createDevice(lockData));
            this.emit('foundDevice', lockData);

            // console.log("=== Getting device token for "+lockMac);
            // const {accessToken="",expiresAt} = await this.getToken(lockMac);

            // this.createdDevice = this.library.createDevice(lockData);
            //console.log("-- Created Device for mac: " + this.createdDevice.lockMac + "\n");

            setTimeout(async () => {

                for (let keyValue of tests) {
                    console.log("*** Running test: " + keyValue[0]);

                    try {

                        for (let command of keyValue[1]) {
                            await ((command.bind(this))()); // rebind this on the fly
                        }

                        console.log("*** Test succeeded");

                    } catch(error) {
                        console.log("*** Test failed.");
                        console.log(error);
                    }
                }

            }, 1000);


        };

    }

    makeTests() {

        this._tests = new Map();

        this._tests.set("resetInit",[this.resetLock,this.initLock]);
        this._tests.set("unlock",[this.unlock]);
        this._tests.set("lock",[this.lock]);
        this._tests.set("lockUnlock",[this.lock,this.unlock,this.lock,this.unlock]);
        this._tests.set("lockUnlockPause",[this.lock,this.pause,this.unlock,this.pause,this.lock,this.pause,this.unlock]);
        this._tests.set("readLockTime",[this.readLockTime]);
        this._tests.set("setLockTime",[this.setLockTime]);
        this._tests.set("getBattery",[this.getBattery]);
        this._tests.set("getLog",[this.getLog]);

    }

    pause() {
        return new Promise(function(resolve, reject) {

            setTimeout(() => {
                console.log("timeout fired!");
                resolve();
            }, 60*1000); // 1 minute timeout

        });
    }

    async notification() {
        console.log("\n--- trying to notify the device ----\n");
        if (this.createdDevice) {

            try {
                let response = await this.createdDevice.notification(NotificationTypeEnum.EKEY);
                console.log(response);
            } catch(err) {
                console.log(err);
            }

        } else {
            console.log("No device created");
        }
    }

    // figure out
    initLibrary(userId=1) {

        this.userId = userId;

        this.library = new OaksBleLockLibrary(this.getToken,this._blePlugin,this._persistencePlugin);
        OaksBleLockLibrary.setHostUrl('https://api.rentlyopensesame.com/oakslock/');

        this.library.userId = 1;
        this.library.timezoneString = TIMEZONE_STR;

        this.library.on('foundDevice', this.foundDevice);
    }

    startScan() {
        this.devices = [];
        this.createdDevice = null;
        this.library.startScan();
    }

    stopScan() {
        this.library.stopScan();
    }

    selectDevice(lockMac) {
        this.createdDevice = this.devices.find(device => device.lockMac === lockMac);
    }

    unlock = async () => {
        console.log("\n--- trying to unlock device ----\n");
        if (this.createdDevice) {

            let response = await this.createdDevice.unlock();
            console.log(response);

        } else {
            console.log("No device created");
        }
    };

    lock = async () => {
        console.log("\n--- trying to lock device ----\n");
        if (this.createdDevice) {

            let response = await this.createdDevice.lock();
            console.log(response);

        } else {
            console.log("No device created");
        }
    }

    async forceUnlock() {
        console.log("\n--- trying to force unlock device ----\n");
        if (this.createdDevice) {

            let response = await this.createdDevice.forceUnlock();
            console.log(response);

        } else {
            console.log("No device created");
        }
    }

    async forceLock() {
        console.log("\n--- trying to force lock device ----\n");
        if (this.createdDevice) {

            let response = await this.createdDevice.forceLock();
            console.log(response);

        } else {
            console.log("No device created");
        }
    }

    async setLockTime() {
        console.log("\n--- trying to set time on the device ----\n");
        if (this.createdDevice) {

            let response = await this.createdDevice.setLockTime();
            console.log(response);

        } else {
            console.log("No device created");
        }
    }

    readLockTime = async () => {
        console.log("\n--- trying to read time on the device ----\n");
        if (this.createdDevice) {

            let response = await this.createdDevice.getLockTime();
            console.log(response);
            this.emit('readLockTimeRes', response);
        } else {
            console.log("No device created");
        }
    }
    async packetLossCheck(){
        let response,pktSentCount = 0,i;
        console.log("\n--- Trying to do packet loss check the device ----\n");
        try{
        if (this.createdDevice) {
            for(i = 0; i < 1;i++){
            response = await this.createdDevice.getLockTime();
            console.log("response=====",response);

            if(response.success){
                pktSentCount++;
            } else {
                if(response[Object.keys(response)[0]][1] === "Error Occurred: Unknown error occurred")
                    pktSentCount++;
            }
            console.log("pktSentCount=====",pktSentCount);
        }
        console.log("Packet loss percentage is = ",((20-pktSentCount)/20)*100);
        } else {
            console.log("No device created");
        }
    }catch(err){
        console.log("Error occurred!!",err);
    }
    }
    async resetLock() {
        console.log("\n--- trying to set reset the lock to uninitialized state ----\n");
        if (this.createdDevice) {

            let response = await this.createdDevice.resetLock();
            console.log(response);

        } else {
            console.log("No device created");
        }
    }

    async initLock() {
        console.log("\n--- trying to set init the lock ----\n");
        if (this.createdDevice) {

            let response = await this.createdDevice.addAdministrator();
            console.log(response);

        } else {
            console.log("No device created");
        }
    }

    async addFob() {
        console.log("\n--- trying to add fob ----\n");
        if (this.createdDevice) {

            // example of the call
            //lockObject.addICCard('2018-12-01', '2018-12-20','09:00:08', '19:00:08', 'IC Card',
            // [false,true,false,true,false,false,false]).then((response) => {
            let startTime = "00:00:08";
            let endTime = "23:59:00";
            let response = await this.createdDevice.addICCard(undefined,undefined,
                                startTime, endTime, 'IC Card',[true,true,true,true,true,true,true]);
            console.log(response);

        } else {
            console.log("No device created");
        }
    }

    async addFobWithNumber() {
        console.log("\n--- trying to add fob with number ----\n");
        if (this.createdDevice) {

            // example of the call
            //lockObject.addICCardWithNumber('2018-12-01', '2018-12-20','09:00:08', '19:00:08','C54DEF',
            // 'IC Card', [false,true,false,true,false,false,false]).then((response) => {

            let startTime = "00:00:08";
            let endTime = "23:59:00";
            let response = await this.createdDevice.addICCardWithNumber(undefined,undefined,
                                        startTime, endTime,'C33902B5','IC Card',
                                                                [true,true,true,true,true,true,true]);
            console.log(response);

        } else {
            console.log("No device created");
        }
    }

    async deleteFobWithNumber() {
        console.log("\n--- trying to delete fob ----\n");
        if (this.createdDevice) {

            let response = await this.createdDevice.deleteICCard(57,"C33902B5");

            console.log(response);

        } else {
            console.log("No device created");
        }
    }

    async addPeriodPasscode() {
        console.log("\n--- trying to add period passcode ----\n");
        if (this.createdDevice) {

            // start is -1 day and end is in 1 year
            let startDate = new Date();
            startDate.setDate(startDate.getDate()-1);
            let endDate = new Date();
            endDate.setFullYear(endDate.getFullYear()+1);

            //lockObject.addPeriodPasscode('1544085020639', '1544297058593', '123456', 'passCode').then((response) => {

            let response = await this.createdDevice.addPeriodPasscode(startDate.getTime(),endDate.getTime(),
                                            '1234', 'test code');

            console.log(response);

        } else {
            console.log("No device created");
        }
    }

    async addPermanentPasscode() {
        console.log("\n--- trying to add permanent passcode ----\n");
        if (this.createdDevice) {

            let response = await this.createdDevice.addPeriodPasscode(0,0, '77777777', 'test code');

            console.log(response);

        } else {
            console.log("No device created");
        }
    }

    async addCyclicPasscode() {
        console.log("\n--- trying to add cyclic passcode ----\n");
        if (this.createdDevice) {

            //lockObject.addCyclicPasscode('2018-12-01', '2018-12-20','09:00:08', '19:00:08', '123456', 'passCode',
            // [false,true,false,true,false,false,false]).then((response) => {

            let startTime = "00:00:08";
            let endTime = "23:59:00";

            let response = await this.createdDevice.addCyclicPasscode(undefined,undefined,startTime,
                                        endTime,"1234","test cyclic",
                                                    [true,true,true,true,true,true,true]);

            console.log(response);

        } else {
            console.log("No device created");
        }
    }

    async deletePasscode() {
        console.log("\n--- trying to delete passcode ----\n");
        if (this.createdDevice) {

            let response = await this.createdDevice.deletePasscode(775,"12345678");

            console.log(response);

        } else {
            console.log("No device created");
        }
    }

    async getLog() {
        console.log("\n--- trying to get Logs ----\n");
        if (this.createdDevice) {

            let response = await this.createdDevice.getLog();

            console.log(response);

        } else {
            console.log("No device created");
        }
    }

    async setAutoLockTime() {
        console.log("\n--- trying to set auto lock time ----\n");
        if (this.createdDevice) {

            // 0 turns off the auto lock. Number of seconds to auto lock if 1 or greater
            let response = await this.createdDevice.setAutoLockTime(0);

            console.log(response);

        } else {
            console.log("No device created");
        }
    }

    async setDoorSensorLocking() {
        console.log("\n--- trying to set door sensor locking----\n");
        if (this.createdDevice) {

            let response = await this.createdDevice.setDoorSensorLocking(true);

            console.log(response);

        } else {
            console.log("No device created");
        }
    }

    async isDoorSensorEnabled() {
        console.log("\n--- trying to get if door sensor is enabled----\n");
        if (this.createdDevice) {

            let response = await this.createdDevice.isDoorSensorEnabled();

            console.log(response);

        } else {
            console.log("No device created");
        }
    }

    async getAutoLockTime() {
        console.log("\n--- trying to get auto lock time----\n");
        if (this.createdDevice) {

            let response = await this.createdDevice.getAutoLockTime();

            console.log(response);

        } else {
            console.log("No device created");
        }
    }

    async getBattery() {
        console.log("\n--- trying to get the battery----\n");
        if (this.createdDevice) {

            let response = await this.createdDevice.getBattery();

            console.log(response);

        } else {
            console.log("No device created");
        }
    }

}

let runner = new LibraryRunner();

let run = async ()=> {

    let response = await blueLogin("rently", "rentlySecret");

    console.log(response);

    if (response.message!==undefined) {
        console.log("unable to get integration partner token.")
        return;
    }

    runner.initLibrary(/*user id here*/);
    // runner.startScan();

}

axios.defaults.baseURL = blueURL;

console.log("=== Logging in to server to get integration partner access token");

run();

module.exports = runner;
