/**
 Copyright: Rently Keyless, 2019

 Author: Ron Gerbasi
 Date: August 2019

 Edited by : Srijita Thakur
 Date: Feb 2020
 */

"use strict";

const fs = require('fs');
const PersistencePluginInterface = require('blelocklibrary/plugins/PersistencePluginInterface');

const storePath = "./";
const objectsPath = storePath + "objects";
const logPath = storePath + "activitylogs";

class PersistencePlugin extends PersistencePluginInterface {

	constructor() {
		super();

		// create the store path if needed
		if (!fs.existsSync(storePath)) {
			fs.mkdirSync(storePath, {recursive: true});
		}

		this._objectStore = this.readFromStore(objectsPath);
		this._logStore = this.readFromStore(logPath);
	}

	readFromStore(path) {

		try {
			let objectStore = fs.readFileSync(path);

			return JSON.parse(objectStore);
		} catch(error) {
			// store wasn't there or couldn't be parsed

			console.log("no store found, so creating new one");

			return {};
		}

	}

	writeToStore(path,obj) {

		//TODO: do we want to protect all writes such that we write to a temp file first and then
		// move it to the correct file?  This would ensure we never messed up the object store if a write issue occurs
		if(path && obj){
			fs.writeFileSync(path, JSON.stringify(obj));
		}
	}

	async readEkey(lockMac) {

		let ekey = this._objectStore[lockMac.toUpperCase()].ekey;

		if (ekey===undefined) throw new Error("ekey not found in store.");

		return ekey;

	}

	async writeEkey(lockMac, ekey) {

		let object = this.objectByMac(lockMac,this._objectStore);

		object.ekey = shallowCopy(ekey);

		this.writeToStore(objectsPath,this._objectStore);

	}

	async deleteEkey(lockMac) {

		delete this._objectStore[lockMac.toUpperCase()].ekey;

		this.writeToStore(objectsPath,this._objectStore);

		console.log('Done delete Ekey for lockMac ', lockMac);
	}

	async readDeviceToken(lockMac) {

		let deviceToken = this._objectStore[lockMac.toUpperCase()].deviceToken;

		if (deviceToken===undefined) throw new Error("device token not found in store.");

		return deviceToken;

	}

	async writeDeviceToken(lockMac, deviceToken) {

		let object = this.objectByMac(lockMac,this._objectStore);

		object.deviceToken = shallowCopy(deviceToken);

		this.writeToStore(objectsPath,this._objectStore);

	}

	async deleteDeviceToken(lockMac) {

		delete this._objectStore[lockMac.toUpperCase()].deviceToken;

		this.writeToStore(objectsPath,this._objectStore);

	}

	objectByMac(lockMac,store) {

		let upperCaseMac = lockMac.toUpperCase();

		let object = store[upperCaseMac];

		if (object===undefined) {
			// if there is no object for the specified lock mac, make one
			store[upperCaseMac] = object = {};
		}

		return object;

	}
	readLogs(lockMac) {
		let logs = this._logStore[lockMac.toUpperCase()] ? this._logStore[lockMac.toUpperCase()].records : undefined;
		return logs;
	}
	storeLogs(lockMac, activityLog) {
		let object = this.objectByMac(lockMac,this._logStore);
		if (object && object.records && object.records.length) {
		    object.records = object.records.concat(activityLog);
		} else {
		    object.records = activityLog;
		}
        this.writeToStore(logPath,this._logStore);
	}
	deleteLogs(lockMac) {
		delete this._logStore[lockMac.toUpperCase()].records;
		this.writeToStore(logPath,this._logStore);
	}

}

function shallowCopy(src) {
	return Object.assign({}, src);
}

module.exports = Object.freeze(PersistencePlugin);