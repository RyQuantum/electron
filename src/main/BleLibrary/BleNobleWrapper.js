const noble = require('noble')

class NobleWrapper {
    static getNoble() {
        if ( !NobleWrapper.nobleObj ){
            NobleWrapper.nobleObj = noble;
        }
        return NobleWrapper.nobleObj;
    }
    static shutdownNoble () {
        if(NobleWrapper.nobleObj) {
            NobleWrapper.nobleObj.shutdown();
            NobleWrapper.nobleObj = undefined;
        }
    }
}
module.exports = NobleWrapper;
