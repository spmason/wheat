var Git = require('git-fs'),
    Data = require('./data'),
    Tools = require('./tools'),
    Path = require('path'),
    Buffer = require('buffer').Buffer,
    Prettify = require('./prettify'),
    MD5 = require('./md5'),
    ChildProcess = require('child_process'),
    Mime = require('mime'),
    Step = require('step');

// Execute a child process, feed it a buffer and get a new buffer filtered.
function execPipe(command, args, data, callback) {
  var child = ChildProcess.spawn(command, args);
  var stdout = [], stderr = [], size = 0;
  child.stdout.addListener('data', function onStdout(buffer) {
    size += buffer.length;
    stdout[stdout.length] = buffer;
  });
  child.stderr.addListener('data', function onStderr(buffer) {
    stderr[stderr.length] = buffer;
  });
  child.addListener('exit', function onExit(code) {
    if (code > 0) {
      callback(new Error(stderr.join("")));
    } else {
      var buffer = new Buffer(size);
      var start = 0;
      for (var i = 0, l = stdout.length; i < l; i++) {
        var chunk = stdout[i];
        chunk.copy(buffer, start);
        start += chunk.length;
      }
      callback(null, buffer);
    }
  });
  if (typeof data === 'string') {
    child.stdin.write(data, "binary");
  } else {
    child.stdin.write(data);
  }
  child.stdin.end();
}

// This writes proper headers for caching and conditional gets
// Also gzips content if it's text based and stable.
function postProcess(headers, buffer, version, path, callback) {
  Step(
    function buildHeaders() {
      if (!headers["Content-Type"]) {
        headers["Content-Type"] = "text/html; charset=utf-8";
      }
      var date = new Date().toUTCString();
      headers["Date"] = date;
      headers["Server"] = "Wheat (node.js)";
      if (version === 'fs') {
        delete headers["Cache-Control"];
      } else {
        headers["ETag"] = MD5.md5(version + ":" + path + ":" + date);
      }

      if (/html/.test(headers["Content-Type"])) {
        buffer = Tools.stringToBuffer((buffer+"").replace(/<pre><code>[^<]+<\/code><\/pre>/g,
          function applyHighlight(code) {
            var code = code.match(/<code>([\s\S]+)<\/code>/)[1];
            code = Prettify.prettyPrintOne(code)
            return "<pre><code>" + code + "</code></pre>";
          }
        ));
      }

      headers["Content-Length"] = buffer.length;

      return {
        headers: headers,
        buffer: buffer
      };
    },
    callback
  );
}

function insertSnippets(markdown, snippets, callback) {
  Step(
    function () {
      Tools.compileTemplate('snippet', this);
    },
    function (err, snippetTemplate) {
      if (err) { callback(err); return; }
      snippets.forEach(function (snippet) {
        var html = snippetTemplate({snippet: snippet});
        markdown = markdown.replace(snippet.original, html);
      });
      return markdown;
    },
    callback
  )
}

var Renderers = module.exports = {
  index: Git.safe(function index(version, callback) {
    Step(
      function getHead() {
        Git.getHead(this);
      },
      function loadData(err, head) {
        if (err) { callback(err); return; }
        Data.articles(version, this.parallel());
        Git.readFile(head, "description.markdown", this.parallel());
				Data.categories(version, this.parallel());
      },
      function applyTemplate(err, articles, description, categories) {
        if (err) { callback(err); return; }
        Tools.render("index", {
          articles: articles,
          description: description,
					categories: categories
        }, this);
      },
      function callPostProcess(err, buffer) {
        if (err) { callback(err); return; }
        postProcess({
          "Cache-Control": "public, max-age=3600"
        }, buffer, version, "index", this);
      },
      callback
    );
  }),

  feed: Git.safe(function feed(version, callback) {
    var articles;
    Step(
      function loadData() {
        Data.fullArticles(version, this);
      },
      function (err, data) {
        if (err) { callback(err); return; }
        articles = data;
        var group = this.group();
        articles.forEach(function (article) {
          insertSnippets(article.markdown, article.snippets, group());
        });
      },
      function applyTemplate(err, markdowns) {
        if (err) { callback(err); return; }
        markdowns.forEach(function (markdown, i) {
          articles[i].markdown = markdown;
        });
        Tools.render("feed.xml", {
          articles: articles
        }, this, true);
      },
      function finish(err, buffer) {
        if (err) { callback(err); return; }
        postProcess({
          "Content-Type":"application/rss+xml",
          "Cache-Control": "public, max-age=3600"
        }, buffer, version, "feed.xml", this);
      },
      callback
    );
  }),

  article: Git.safe(function renderArticle(version, name, callback) {
    var article, description;
    Step(
      function loadData() {
        Git.getHead(this.parallel());
        Data.fullArticle(version, name, this.parallel());
      },
      function (err, head, props) {
        if (err) { callback(err); return; }
        article = props;
        insertSnippets(article.markdown, article.snippets, this.parallel());
        Git.readFile(head, "description.markdown", this.parallel());
      },
      function applyTemplate(err, markdown, description) {
        if (err) { callback(err); return; }
        article.markdown = markdown;
        Tools.render("article", {
          title: article.title,
          article: article,
          author: article.author,
          description: description
        }, this);
      },
      function finish(err, buffer) {
        if (err) { callback(err); return; }
        postProcess({
          "Cache-Control": "public, max-age=3600"
        }, buffer, version, name, this);
      },
      callback
    );
  }),

  markdown: function markdown(fileOrFolderName){
    return Git.safe(function renderMarkdown(version, name, callback) {
      var markdown;
      Step(
        function getHead() {
          Git.getHead(this);
        },
        function (err, head, props) {
          if (err) { callback(err); return; }
          Git.readFile(version, Path.join(fileOrFolderName, name + ".markdown"), this);
        },
        function applyTemplate(err, markdown) {
          if (err) { callback(err, null, true); return; }
          Tools.render("content", {
            markdown: markdown
          }, this);
        },
        function finish(err, buffer) {
          if (err) { callback(err); return; }
          postProcess({
            "Cache-Control": "public, max-age=3600"
          }, buffer, version, name, this);
        },
        callback
      );
    });
  },
  
  tag: Git.safe(function index(version, tag, callback) {
    Step(
      function getHead() {
        Git.getHead(this);
      },
      function loadData(err, head) {
        if (err) { callback(err); return; }
        Data.taggedArticles(version, tag, this.parallel());
        Git.readFile(head, "description.markdown", this.parallel());
      },
      function applyTemplate(err, articles, description) {
        if (err) { callback(err); return; }
        Tools.render("index", {
          articles: articles,
          description: description
        }, this);
      },
      function callPostProcess(err, buffer) {
        if (err) { callback(err); return; }
        postProcess({
          "Cache-Control": "public, max-age=3600"
        }, buffer, version, "index", this);
      },
      callback
    );
  }),

  tags: Git.safe(function renderTags(version, callback) {
    var tags;
    Step(
      function loadData() {
        Git.getHead(this.parallel());
        Data.tags(version, this.parallel());
      },
      function applyTemplate(err, head, tags) {
        console.log('applyTemplate');
        if (err) { callback(err); return; }
        console.log('applyTemplate');
        Tools.render("tags", {
          tags: tags
        }, this);
      },
      function finish(err, buffer) {
        if (err) { callback(err); return; }
        postProcess({
          "Cache-Control": "public, max-age=3600"
        }, buffer, version, "tags", this);
      },
      callback
    );
  }),

  categoryIndex: Git.safe(function index(version, category, callback) {
    Step(
      function getHead() {
        Git.getHead(this);
      },
      function loadData(err, head) {
        if (err) { callback(err); return; }
        Data.articles(version, this.parallel());
        Git.readFile(head, "description.markdown", this.parallel());
				Data.categories(version, this.parallel());
      },
      function applyTemplate(err, articles, description, categories) {
        if (err) { callback(err); return; }
				
        var articlesForCategory = articles.reduce(function (start, element){
          return element.categories && element.categories.indexOf(category) >= 0 ? start.concat(element) : start;
        }, []);
								
        Tools.render("index", {
          articles: articlesForCategory,
          description: description,
					categories: categories
        }, this);
      },
      function callPostProcess(err, buffer) {
        if (err) { callback(err); return; }
        postProcess({
          "Cache-Control": "public, max-age=3600"
        }, buffer, version, "index", this);
      },
      callback
    );
  }),

  staticFile: Git.safe(function staticFile(version, path, callback) {
    Step(
      function loadPublicFiles() {
        Git.readFile(version, "skin/public/" + path, this);
      },
      function loadArticleFiles(err, data) {
        if (err) {
          Git.readFile(version, "articles/" + path, this);
        }
        return data;
      },
      function processFile(err, data) {
        if (err) { callback(err); return; }
        var headers = {
          "Content-Type": Mime.lookup(path),
          "Cache-Control": "public, max-age=32000000"
        };
        postProcess(headers, data, version, path, this);
      },
      callback
    );
  }),

  dotFile: Git.safe(function dotFile(version, path, callback) {
    Step(
      function loadPublicFiles() {
        Git.readFile(version, "skin/public/" + path, this);
      },
      function loadArticleFiles(err, data) {
        if (err) {
          Git.readFile(version, "articles/" + path, this);
        }
        return data;
      },
      function processFile(err, data) {
        if (err) { callback(err); return; }
        execPipe("dot", ["-Tpng"], data, this);
      },
      function finish(err, buffer) {
        if (err) { callback(err); return; }
        postProcess({
          "Content-Type": "image/png",
          "Cache-Control": "public, max-age=32000000"
        }, buffer, version, path, this);
      },
      callback
    );
  })
}
