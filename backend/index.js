const { main } = require('./stream');

main().catch((error) => {
  console.error('Error in main:', error);
}); 