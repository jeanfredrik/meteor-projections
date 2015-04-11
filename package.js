Package.describe({
  name: 'jeanfredrik:projections',
  version: '0.1.0',
  summary: 'Turn a cursor into a local collection',
  git: 'https://github.com/jeanfredrik/meteor-projections.git',
  documentation: 'README.md'
});

Package.onUse(function(api) {
  api.versionsFrom('1.1');
  api.use([
    'underscore',
    'tracker',
    'mongo',
  ]);
  api.addFiles('projections.js', 'client');
  api.export('Projections');
});

Package.onTest(function(api) {
  api.use('tinytest');
  api.use('jeanfredrik:projections');
  api.addFiles('projections-tests.js');
});
