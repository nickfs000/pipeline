const GitHub = require('github-api');
const request = require('request');
const CLIENT = require('../config/client');

class GithubApi {
  constructor(opts) {
    opts = opts || {};
    this.api = null;
    if(opts.access_token) {
      this.api = new GitHub({token : opts.access_token});
    }
  }

  getAuthUrl() {
    const url = CLIENT.GITHUB_END_POINT + '/authorize'
        + '?client_id=' + CLIENT.GITHUB_CLIENT_ID
        + '&scope=user%20repo'
        + '&redirect_uri=' + encodeURIComponent(CLIENT.GITHUB_CALLBACK_URL)
        + '&state=' + CLIENT.GITHUB_STATE;
    return url;
  }

  /**
   * Authorize access token from code
   * @param {String} code 
   * @param {Function} callback 
   */
  authorize(code, callback) {
    let resp = {};
    const self = this;
    const tokenUrl = CLIENT.GITHUB_END_POINT + '/access_token'
      + '?client_id=' + CLIENT.GITHUB_CLIENT_ID
      + '&client_secret=' + CLIENT.GITHUB_CLIENT_SECRET
      + '&code=' + code
      + '&state=' + CLIENT.GITHUB_STATE;
    request.get({url:tokenUrl, json: true}, function (err, body, token) {
      //console.log('>>>> request result ', err, token);
      if(err) return callback(err);

      resp = token;
      self.api = new GitHub({token : token.access_token});
      const me = self.api.getUser();
      // Request profile
      me.getProfile(function(err, profile){
        if(err) return callback(err);

        resp['avatar'] = profile.avatar_url;
        resp['username'] = profile.name;
        // List repository
        me.listRepos({type : 'all'}, function(err, repos){
          if(err) return callback(err);
          resp['repos'] = [];
          for(let rep of repos) {
            resp.repos.push({
              id : rep.id,
              name : rep.name,
              full_name : rep.full_name,
              private : rep.private
            });
          }
          console.log('>>>> request listRepos ', err, resp);
          callback(err, resp);
        })

      });
    })
  }


  /**
   * get repository List by user()
   * no user specified defaults to the user for whom credentials were provided
   * @return {Promise}
   */
  getListRepos() {
    var self = this;
    return new Promise(function(resolve, reject) {
      console.log('======================= getListRepos =======================');
      if (self.api) {
        var me = self.api.getUser(); 
        me.listRepos(function(err, result) {
          // do some stuff
          console.log('err . ' + err );
          console.log('repoList. ' + util.inspect(result,false,null) );
        });
        resolve(self.api);
      } else {
        reject(new Error('no repos'));
      }
    });
  };

  /**
   * get repository
   * @param {String} user name
   * @param {String} repo name
   * @return {Promise}
   */
  getRepo(user, repo) {
    var self = this;
    return new Promise(function(resolve, reject) {
      console.log('======================= getRepo =======================');
      if (self.api && user && repo) {
        var myRepo = self.api.getRepo(user, repo);
        console.log('myRepo. ' + util.inspect(myRepo,false,null) );
        return resolve(myRepo);
      } else {
        return reject(new Error('no repos'));
      }
    });
  };

  /**
   * get Branches list
   * @param {repo} repo
   * @return {Promise}
   */
  getRepoBrancheList(myRepo) {
    var self = this;
    return new Promise(function(resolve, reject) {
      console.log('======================= getRepoBrancheList =======================');

      if (myRepo) {
        myRepo.listBranches(function(err, result) {
          // do some stuff
          console.log('err . ' + err );
          console.log('listBranches. ' + util.inspect(result,false,null) );
          resolve(result);
        });
      } else {
        reject(new Error('no repos'));
      }
    });
  };

  /**
   * get commit list
   * @param {repo} repo
   * @param {String} sha Of Branch
   * @return {Promise}
   */
  getRepoCommitList(myRepo, shaOfBranch) {
    var self = this;
    return new Promise(function(resolve, reject) {
      console.log('======================= getRepoCommitList =======================');

      if (myRepo) {
        myRepo.listCommits({
           sha: shaOfBranch
        }, function(err, result) {
          // do some stuff
          console.log('err . ' + err );
          console.log('listCommits. ' + util.inspect(result,false,null) );
          resolve(result);
        });
      } else {
        reject(new Error('no repos'));
      }
    });
  };

  /**
   * get commit
   * @param {repo} repo
   * @param {String} sha Of commit
   * @return {Promise}
   */
  getRepoCommit(myRepo, shaOfCommit) {
    var self = this;
    return new Promise(function(resolve, reject) {
      console.log('======================= getRepoCommit =======================');
      if (myRepo) {
        myRepo.getCommit(shaOfCommit, function(err, result) {
          // do some stuff
          console.log('err . ' + err );
          console.log('Commit. ' + util.inspect(result,false,null) );
          resolve(result);
        });
      } else {
        reject(new Error('no repos'));
      }
    });
  };

  /**
   * get Repo Commits content
   * @param {repo} repo
   * @param {String} ref - the ref to check
   * @param {String} path - the path containing the content to fetch
   * @param {boolean} raw - `true` if the results should be returned raw instead of GitHub's normalized format
   * @return {Promise}
   */
  getRepoCommitContent(myRepo, ref, path, raw) {
    var self = this;
    return new Promise(function(resolve, reject) {
      console.log('======================= getRepoCommitContent =======================');
      console.log(ref, path, raw);
      if (myRepo) {
        myRepo.getContents(ref, path, raw, function(err, result) {
          // do some stuff
          console.log('err . ' + err );
          // console.log('CommitContent. ' + util.inspect(result,false,null) );
          resolve(result);
        });
      } else {
        reject(new Error('no repos'));
      }
    });
  };


  /**
   * get diff : Compare two branches/commits/repositories
   * @param {repo} repo
   * @see https://developer.github.com/v3/repos/commits/#compare-two-commits
   * @param {string} base - the base commit
   * @param {string} head - the head commit
   * @return {Promise}
   */
  GetCompareBranches(myRepo, base, head) {
    var self = this;
    return new Promise(function(resolve, reject) {
      console.log('======================= GetCompareBranches =======================');
      console.log(myRepo, base, head);
      if (myRepo) {
        myRepo.compareBranches(base, head, function(err, result) {
          // do some stuff
          console.log('err . ' + err );
          console.log('CompareBranches. ' + util.inspect(result,false,null) );
          resolve(result);
        });
      } else {
        reject(new Error('no repos'));
      }
    });
  };

  /**
   * get pull requests List
   * @see https://developer.github.com/v3/repos/commits/#compare-two-commits
   * @param {repo} repo
   * @param {Object} options - options to filter the search
   * @return {Promise}
   */
  getPRList(myRepo, options) {
    var self = this;
    return new Promise(function(resolve, reject) {
      console.log('======================= getPRList =======================');

      if (myRepo) {
        myRepo.listPullRequests(options, function(err, result) {
          // do some stuff
          console.log('err . ' + err );
          console.log('getPRList. ' + util.inspect(result,false,null) );
          resolve(result);
        });
      } else {
        reject(new Error('no PullRequest'));
      }
    });
  };

  /**
   * get pull request
   * @see https://developer.github.com/v3/pulls/#get-a-single-pull-request
   * @param {repo} repo
   * @param {number} number - the PR you wish to fetch
   * @return {Promise}
   */
  getPullRequest(myRepo, number) {
    var self = this;
    return new Promise(function(resolve, reject) {
      console.log('======================= getPullRequest =======================');
      if (myRepo) {
        myRepo.getPullRequest(number, function(err, result) {
          // do some stuff
          console.log('err . ' + err );
          console.log('PullRequest. ' + util.inspect(result,false,null) );
          resolve(result);
        });
      } else {
        reject(new Error('no PullRequest'));
      }
    });
  };

  /**
   * get pull request file list
   * @see https://developer.github.com/v3/pulls/#get-a-single-pull-request
   * @param {repo} repo
   * @param {number} number - the PR you wish to fetch
   * @return {Promise}
   */
  getPullRequestFileList(myRepo, number) {
    var self = this;
    return new Promise(function(resolve, reject) {
      console.log('======================= getPullRequestFileList =======================');
      if (myRepo) {
        myRepo.listPullRequestFiles(number, function(err, result) {
          // do some stuff
          console.log('err . ' + err );
          // console.log('PullRequest. ' + util.inspect(result,false,null) );
          resolve(result);
        });
      } else {
        reject(new Error('no PullRequest file'));
      }
    });
  };

  /**
   * download file(set file path structure and file content)
   * @param {String} directoryToSave file structure root path('output/' )
   * @param {String} sha Of commit ('95241a71b59af9b45de029ae86624fc26edb700a')
   * @param {List} files - the PR file list
   * @return {Promise}
   */
  setFileContentByFiles(directoryToSave, shaOfCommit, prFiles) {

    const makeDir = require("make-dir");

    var self = this;
    return new Promise(function(resolve, reject) {
      if (!prFiles) {
        return reject(new Error('File not exist'));
      }

      prFiles.forEach(function(element) {
        // get filename list
        console.log(element.filename);
        self.getRepoCommitContent(myRepo, shaOfCommit, 
          element.filename, true)
        .then(function(file) {
          // auto make file dir
          var dirStr = path.join(__dirname, directoryToSave + element.filename);
          // var dirStrWithouFileName = dirStr.substring(0, dirStr.lastIndexOf("\\"));
          var dirStrWithouFileName = path.dirname(dirStr);

          console.log('>>>>>>>>>>>>>> ' + dirStrWithouFileName);
          makeDir(dirStrWithouFileName).then(path => {
            fs.writeFile(
              dirStr,
              file, function(err) {
                if(err) {
                  // return console.log(err);
                  return reject(new Error('err ' + err));
                }
                console.log("The file was saved!");
            }); 
          });

        });

      });

      resolve();
    });

  };
}


module.exports = GithubApi;