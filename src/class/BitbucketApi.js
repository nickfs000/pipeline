//https://bitbucket.org/account/user/dawn8898/api
const request = require('request');
const async = require('async');
const path = require('path');
const url = require('url');
const qs = require('querystring');

const CLIENT = require('../config/client');
const utils = require('./Utils.js');
const Metadata = require('./Metadata.js');

const util = require('util');

class BitbucketApi {
  constructor(opts) {
    opts = opts || {};
    this.api = null;
    this.access_token = opts.access_token;
    // Pipeline info object
    this.pipeline = null; 
    // Pipeline process logger
    this.logger = null; 
  }

  getAuthUrl() {
    const url = CLIENT.BITBUCKET_END_POINT + '/authorize'
        + '?client_id=' + CLIENT.BITBUCKET_CLIENT_ID
        + '&response_type=token';
    //console.log('>>>> getAuthUrl ', url);
    return url;
  }

  /**
   * Authorize access token from code
   * @param {Object} token  { access_token : '', scopes : 'pullrequest account', 
   *                          expires_in : '7200', token_type : 'bearer'}
   * @param {Function} callback 
   */
  authorize(token, callback) {
    let resp = {};
    const self = this;
    resp = token;
    self.access_token = token.access_token;
    self.apiCall('user', function(err, user) {
      if(err) return callback(err);
      resp['username'] = user.username;
      resp['avatar'] = user.links.avatar.href;
      self.apiCall('repositories/' + user.username, { sort : '-updated_on' }, function(err, response) {
        if(err) return callback(err);
        const repos = response.values;
        resp['repos'] = [];
        for(let rep of repos) {
          resp.repos.push({
            id : rep.uuid,
            name : rep.name,
            full_name : rep.full_name,
            private : rep.is_private
          });
        }
        console.log('>>>> request listRepos ', err, resp);
        callback(err, resp);
      }); // .self.apiCall('repositories/'
    }); // .self.apiCall('user'
  }

  /**
   * get repository
   * @param {String} username - name
   * @param {String} repo_slug - name
   * @return {Promise}
   */
  getRepos(username, repo_slug) {
    var self = this;
    return new Promise(function(resolve, reject) {
      console.log('======================= getRepo =======================');

      if (!self.access_token || utils.isBlank(username) || utils.isBlank(repo_slug)) {
        return reject(new Error('Auth Error'));
      }
      self.apiCall('repositories/' + username + '/' + repo_slug, function(err, response) {
        if(err) return reject(new Error('Error' + err));
        return resolve(response);
      });

    });
  };

  /**
   * Get pull requests List
   * @see https://developer.atlassian.com/bitbucket/api/2/reference/resource/repositories/%7Busername%7D/%7Brepo_slug%7D/pullrequests
   * @param {String} username
   * @param {String} repo_slug - repos name
   * @return {Promise}
   */
  getPullRequests(username, repo_slug) {
    var self = this;
    return new Promise(function(resolve, reject) {
      console.log('======================= getPRList =======================');

      if (!self.access_token || utils.isBlank(username) || utils.isBlank(repo_slug)) {
        return reject(new Error('Auth Error'));
      }
      self.apiCall('repositories/' + username + '/' + repo_slug + '/pullrequests' , function(err, result) {
        if(err) return reject(err);

        if(utils.isBlank(result.values) || result.values.length == 0) return resolve([]);
        let pulls = [];
        for(let res of result.values) {
          let pr = utils.popItems(res, ['id', 'title', 'created_on', 'updated_on']);
          // pr['base'] = res.source.repository;
          // source commit sha
          pr['base'] = res.source.commit.hash;
          pr['user'] = {};
          pr['user']['loginname'] = res.author.username;
          pr['user']['avatar'] = res.author.links.avatar.href;
          pulls.push(pr);
        }
        return resolve(pulls);
      });

    });
  };


  /**
   * Get branch list
   * @param {String} username
   * @param {String} repo_slug - repos name
   * @return {Promise} - Branch list
   */
  getBranches(username, repo_slug) {
    var self = this;
    return new Promise(function(resolve, reject) {
      if (!self.access_token || utils.isBlank(username) || utils.isBlank(repo_slug)) {
        return reject(new Error('Auth Error'));
      }

      self.apiCall('repositories/' + username + '/' + repo_slug + '/refs/branches', function(err, result) {

        if(err) return reject(new Error('Error' + err));
        if(utils.isBlank(result.values) || result.values.length == 0) return resolve([]);
        return resolve(result.values);
      });

    });
  };

  /**
   * Get commit list from branch sha
   * @param {String} username
   * @param {String} repo_slug - repos name
   * @param {String} branchName - Branch name
   * @return {Promise} - Commit list
   */
  getCommits(username, repo_slug, branchName) {
    var self = this;
    return new Promise(function(resolve, reject) {
      console.log('======================= getRepoCommitList =======================');

      if (!self.access_token || utils.isBlank(username) || utils.isBlank(repo_slug) || utils.isBlank(branchName)) {
        return reject(new Error('Auth Error'));
      }

      self.apiCall('repositories/' + username + '/' + repo_slug + '/commits' 
                    + '/' + branchName, function(err, result) {
        if(err) return reject(new Error('Error' + err));
        if(utils.isBlank(result.values) || result.values.length == 0) return resolve([]);
        
        let commits = [];
        for(let c of result.values) {
          let com = utils.popItems(c, ['hash']);
          com['message'] = c.message;
          com['commit_date'] = c.date;
          com['author'] = {};
          com['author']['loginname'] = c.author.raw;
          commits.push(com);
          console.log('>>> listCommits com', com);
        }
        return resolve(commits);
      });
    });
  };

  /**
   * Download files for pipeline
   * @param {Object} pipeline 
   * @param {Object} connection 
   */
  getFiles(pipeline, connection, logger) {
    const self = this;
    self.pipeline = pipeline;
    self.logger = logger;  // Report process log to 
    let log = '';
    if(pipeline.type == 'pr') {
      log += '#' + pipeline.prs.join(', #');
    } else {
      log += '#' + pipeline.branch + ' ' + pipeline.commits.join(',');
    }
    self.logger('[Bitbucket] Pull from ' + connection.repos.name + ' (' + log + '):');
    return new Promise(function(resolve, reject) {
      self.getRepos(connection.loginname, connection.repos.name)
      .then(function(repos){
        //console.log('>>>> getRepos ', repos)
        // Download files
        if(pipeline.type == 'pr') {
          return self.getFilesFromPRs(connection.loginname, connection.repos.name, pipeline.prs);
        } else {
          return self.getFilesFromCommits(connection.loginname, connection.repos.name, pipeline.commits);
        }
      })
      .then(function(success) {
        self.logger('[Bitbucket] Pull Done.');
        return resolve(success);
      })
      .catch(function(err){
        return reject(err);
      });
    });
  }

  /**
   * Get files from multiple pr object
   * @see https://developer.atlassian.com/bitbucket/api/2/reference/resource/repositories/%7Busername%7D/%7Brepo_slug%7D/diffstat/%7Bspec%7D
   * @param {String} username
   * @param {String} repo_slug - repos name
   * @param {Array} prs - Pull Request Object array 
   * @return {Promise}
   */
  getFilesFromPRs(username, repo_slug, prs) {
    var self = this;
    return new Promise(function(resolve, reject) {
      console.log('======================= getFilesFromCommits =======================');

      if (!self.access_token || utils.isBlank(username) || utils.isBlank(repo_slug) ) {
        return reject(new Error('Auth Error'));
      }

      async.eachSeries(prs, function(prObj, callback) {

        self.apiCall('repositories/' + username + '/' + repo_slug + '/pullrequests'
             + '/' + prObj.Id + '/diffstat', function(err, result) {
          if(err) { return reject(err); }
          // Fetch file content to local
          self.fetchFilesContent(username, repo_slug, prObj.base, result.values)
          .then(function(success) {
            //console.log('>>>> get commit', shaOfCommit, 'completed');
            return callback(null);
          })
          .catch(function(err) {
            return callback(err);
          });

        }); 
      }, function(err){
        //console.log('>>>> getFilesFromCommits DONE');
        if(err) { return reject(err); }
        return resolve(true);
      });

    });
  };

  /**
   * Get files from commits in branch
   * @see https://developer.atlassian.com/bitbucket/api/2/reference/resource/repositories/%7Busername%7D/%7Brepo_slug%7D/diffstat/%7Bspec%7D
   * @param {String} username
   * @param {String} repo_slug - repos name
   * @param {Array} commits 
   * @return {Promise}
   */
  getFilesFromCommits(username, repo_slug, commits) {
    var self = this;
    return new Promise(function(resolve, reject) {
      console.log('======================= getFilesFromCommits =======================');

      if (!self.access_token || utils.isBlank(username) || utils.isBlank(repo_slug) ) {
        return reject(new Error('Auth Error'));
      }

      async.eachSeries(commits, function(shaOfCommit, callback) {

        self.apiCall('repositories/' + username + '/' + repo_slug + '/diffstat' 
                      + '/' + shaOfCommit , function(err, result) {
          if(err) { return reject(err); }
          // Fetch file content to local
          self.fetchFilesContent(username, repo_slug, shaOfCommit, result.values)
          .then(function(success) {
            //console.log('>>>> get commit', shaOfCommit, 'completed');
            return callback(null);
          })
          .catch(function(err) {
            return callback(err);
          });

        }); 
      }, function(err){
        //console.log('>>>> getFilesFromCommits DONE');
        if(err) { return reject(err); }
        return resolve(true);
      });

    });
  };

  /**
   * Fetch files content to local
   * @param {String} username
   * @param {String} repo_slug - repos name
   * @param {String} shaOfCommit - Branch sha
   * @param {Array} files - the files to fetch
   * @return {Promise}
   */    
  fetchFilesContent(username, repo_slug, shaOfCommit, files) {
    const self = this;
    const metadata = new Metadata();
    return new Promise(function(resolve, reject) {
      //console.log('>>>> download files', files.length);
      async.eachSeries(files, function(file, callback) {
        //console.log('>>>> download', file.filename);
        let filename = path.basename(file.new.path);
        filename = utils.getFileName(filename);
        if(utils.isBlank(filename)) {
          // eg, .gitignore
          return callback(null);
        }

        self.apiCall_v1('repositories/' + username + '/' + repo_slug + '/raw' 
                      + '/' + shaOfCommit + '/' + file.new.path , function(err, content) {

          self.logger('        > ' + file.new.path);
          // Save file content
          metadata.saveSingleFile(self.pipeline.id, file.new.path, content)
          .then(function(success) {
            //console.log('>>>> download', file.filename, 'completed');
            return callback(null);
          })
          .catch(function(err) {
            return callback(err);
          });
        }); 

      }, function(err){
        //console.log('>>>> download completed', err);
        if(err) { return reject(err); }
        return resolve(true);
      });
    });
  }
  
  apiCall(apiName, opts, callback) {
    if(typeof opts == 'function') {
      callback = opts;
      opts = {};
    }
    const params = {
      headers: {
        Authorization: ' Bearer ' + this.access_token
      },
      qs: opts,
      url: CLIENT.BITBUCKET_API + '/' + apiName,
      json: true,
    };

    request.get(params, function(err, body, res) {
      callback(err, res);
    });
  }

  apiCall_v1(apiName, opts, callback) {
    if(typeof opts == 'function') {
      callback = opts;
      opts = {};
    }
    const params = {
      headers: {
        Authorization: ' Bearer ' + this.access_token
      },
      qs: opts,
      url: CLIENT.BITBUCKET_API_V1 + '/' + apiName,
      json: true,
    };

    request.get(params, function(err, body, res) {
      callback(err, res);
    });
  }
}

module.exports = BitbucketApi;