const { main } = require('./stream');
const server = require('./server');

main().catch((error) => {
  console.error('Error in main:', error);
}); 