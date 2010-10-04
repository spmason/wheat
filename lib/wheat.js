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
    Git = require('git-fs'),
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
    function callback(err, data, continueOnNotFound) {
      if (err) {
        if (continueOnNotFound && err.errno == process.ENOENT) {
          next();
        } else {
          next(err);
        }
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

function extend(app){
  app.index = function(route){
    app.get(route, function(req, res, next){
      render(req, res, next, Renderers.index);
    });
  };
  app.feed = function(route){
    app.get(route, function(req, res, next){
      render(req, res, next, Renderers.feed);
    });
  };
  app.tags = function(route){
    app.get(route, function(req, res, next){
      render(req, res, next, Renderers.tags);
    });
  };
  app.tag = function(route){
    app.get(route, function(req, res, next){
      render(req, res, next, Renderers.tag);
    });
  };
  app.article = function(route){
    app.get(route, function(req, res, next){
      render(req, res, next, Renderers.article);
    });
  };
  app.markdown = function markdown(route, fileOrFolderName){
    app.get(route, function(req, res, next){
      render(req, res, next, Renderers.markdown(fileOrFolderName));
    });
  };
  app.dotFile = function(route){
    app.get(route, function(req, res, next){
      render(req, res, next, Renderers.dotFile);
    });
  };
  app.staticFile = function(route){
    app.get(route, function(req, res, next){
      render(req, res, next, Renderers.staticFile);
    });
  };
}

module.exports = function defaultSetup(repo, routes){
  // Initialize the Git Filesystem
  Git(repo || process.cwd());

  return Connect.router(function(app){
    extend(app);

    if(routes){
      routes(app);
      return;
    }

    app.index(/^\/()$/);
    app.feed(/^\/()feed.xml$/);
    app.tags(/^\/()tags\/?$/);
    app.tag(/^\/()tag\/([a-z0-9_-]+)$/);
    app.article(/^\/([a-f0-9]{40})\/([a-z0-9_-]+)$/);
    app.dotFile(/^\/([a-f0-9]{40})\/(.+\.dot)$/);
    app.staticFile(/^\/([a-f0-9]{40})\/(.+\.[a-z]{2,4})$/);
    app.article(/^\/()([a-z0-9_-]+)$/);
    app.dotFile(/^\/()(.+\.dot)$/);
    app.staticFile(/^\/()(.+\.[a-z]{2,4})$/);
  });
};
