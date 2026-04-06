require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const AIONServer = require('./server/index');

const server = new AIONServer();
server.start();