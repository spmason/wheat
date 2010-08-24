/*
Copyright (c) 2010 Tim Caswell <tim@creationix.com>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/

require.paths.unshift(__dirname + "/wheat");

require('proto');
var Url = require('url'),
    Connect = require('connect'),
    Git = require('git'),
    Renderers = require('renderers');

var useDefaultRoutes = true;
var routes = [];

function render(req, res, next, renderer){
  if (req.params[0] === '') {
    // Resolve head to a sha if unspecified
    Git.getHead(function (err, sha) {
      if (err) { throw err; }
      req.params[0] = sha;
      applyRenderer(req, res, next, renderer);
    });
  } else {
    applyRenderer(req, res, next, renderer);
  }

  function applyRenderer(req, res, next, renderer) {
    function callback(err, data) {
      if (err) {
        next(err);
        return;
      }
      res.writeHead(200, data.headers);
      res.end(data.buffer);
    }
    renderer.apply(null, req.params.concat([callback]));
  }
}

function addRoute(route, renderer){
  return Connect.router(function(app){
    app.get(route, function(req, res, next){
      render(req, res, next, renderer);
    });
  });
}

module.exports = function defaultSetup(repo){
  setup(repo);

  return Connect.router(function(app){
    app.get(/^\/()$/, function(req, res, next){
      render(req, res, next, Renderers.index);
    });
    app.get(/^\/()feed.xml$/, function(req, res, next){
      render(req, res, next, Renderers.feed);
    });
    app.get(/^\/()tags\/?$/, function(req, res, next){
      render(req, res, next, Renderers.tags);
    });
    app.get(/^\/()tag\/([a-z0-9_-]+)$/, function(req, res, next){
      render(req, res, next, Renderers.tag);
    });
    app.get(/^\/([a-f0-9]{40})\/([a-z0-9_-]+)$/, function(req, res, next){
      render(req, res, next, Renderers.article);
    });
    app.get(/^\/([a-f0-9]{40})\/(.+\.dot)$/, function(req, res, next){
      render(req, res, next, Renderers.dotFile);
    });
    app.get(/^\/([a-f0-9]{40})\/(.+\.[a-z]{2,4})$/, function(req, res, next){
      render(req, res, next, Renderers.staticFile);
    });
    app.get(/^\/()([a-z0-9_-]+)$/, function(req, res, next){
      render(req, res, next, Renderers.article);
    });
    app.get(/^\/()(.+\.dot)$/, function(req, res, next){
      render(req, res, next, Renderers.dotFile);
    });
    app.get(/^\/()(.+\.[a-z]{2,4})$/, function(req, res, next){
      render(req, res, next, Renderers.staticFile);
    });
  });
};

var setup = module.exports.setup = function setup(repo){
  // Initialize the Git Filesystem
  Git(repo || process.cwd());
};
var index = module.exports.index = function index(route){
  return addRoute(route, Renderers.index);
};
var feed = module.exports.feed = function feed(route){
  return addRoute(route, Renderers.feed);
};
var article = module.exports.article = function article(route){
  return addRoute(route, Renderers.article);
};
var markdown = module.exports.markdown = function markdown(route, fileOrFolderName){
  return addRoute(route, Renderers.markdown(fileOrFolderName));
};
var tag = module.exports.tag = function tag(route){
  return addRoute(route, Renderers.tag);
};
var tags = module.exports.tags = function tags(route){
  return addRoute(route, Renderers.tags);
};
var staticFile = module.exports.staticFile = function staticFile(route){
  return addRoute(route, Renderers.staticFile);
};
var dotFile = module.exports.dotFile = function dotFile(route){
  return addRoute(route, Renderers.dotFile);
};