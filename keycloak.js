const keycloak = new Keycloak({
  url: 'http://localhost:8180',
  realm: 'Keycloak',
  clientId: 'my-planner'
});

keycloak.init({
  onLoad: 'login-required'
}).then(authenticated => {
  console.log(authenticated ? 'Authenticated' : 'Not authenticated');
  if (!authenticated) {
    window.location.reload();
  }
}).catch(() => {
  console.log('Failed to initialize');
});