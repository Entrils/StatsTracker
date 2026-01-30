fetch("https://discord.com/api/v10/gateway")
  .then(r => r.text())
  .then(console.log)
  .catch(console.error);