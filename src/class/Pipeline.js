const path = require('path');
const fs = require('fs');
const uuidv4 = require('uuid/v4');
const moment = require('moment');

const Storage = require('./Storage.js');
const GithubApi = require('./GithubApi.js');
const BitbucketApi = require('./BitbucketApi.js');
const SfdcApi = require('./SfdcApi.js');
const Metadata = require('./Metadata.js');
const utils = require('./Utils.js');

class Pipeline {
  constructor(opts) {
    this.storage = new Storage({
      configName: 'pipeline'
    });
  }

  newPipeline(ev, arg) {
    const callback = function(err, result) {
      ev.sender.send('data-new-pipeline-callback',err, result);
    }
    try{
      let pipelines = this.storage.getAll({ cache : false }); 
      if(!pipelines) pipelines = [];
      let pipeline = arg.pipeline;
      pipeline['id'] = uuidv4();
      pipelines.push(arg.pipeline);
      this.storage.setAll(pipelines);
      return callback(null, {id : pipeline.id});
    }catch(err) {
      return callback(err);
    }
  }

  /**
   * Save pipeline info by id
   * @param {String} id 
   * @param {Object} arg 
   * @return {Boolean} 
   */
  setPipeline(id, arg) {
    try{
      let pipelines = this.storage.getAll({ cache : false }); 
      for(let i in pipelines) {
        if(id === pipelines[i].id) {
          for(let key in arg) {
            pipelines[i][key] = arg[key];
          }
          const now = new Date();
          pipelines[i].updated_at = now.toISOString();
        }
      }
      this.storage.setAll(pipelines);
      return true;
    }catch(err) {
      return false;
    }
  }

  getPipelines(ev, arg) {
    const callback = function(err, result) {
      ev.sender.send('data-pipelines-callback',err, result);
    }
    try{
      let result = this.storage.getAll({ cache : false }); 
      console.log('>>>> getPipelines ', result);
      return callback(null, result);
    }catch(err) {
      return callback(err);
    }
  }

  /**
   * Get pipeline log file content
   * @param {Object} ev 
   * @param {Object} arg 
   */
  getPipelineLog(ev, arg) {
    const callback = function(err, result) {
      ev.sender.send('data-pipeline-log-callback',err, result);
    }
    try{
      console.log('>>> getPipelineLog', (new Date()));
      const metadata = new Metadata();
      const pPath = metadata.getPipelineFolder();
      const logPath = path.join(pPath, arg.id, 'pipeline.log');
      if(!fs.existsSync(logPath)) {
        return callback(null);
      }
      fs.readFile(logPath, 'utf-8', function(err, data) {
        if(err) return callback(err);
        const result = data;
        return callback(null, result);
      });
    }catch(err) {
      return callback(err);
    }
  }

  /**
   * Start to run pipeline with id
   * @param {Object} ev 
   * @param {Object} arg 
   */
  runPipeline(ev, arg) {
    const self = this;
    const callback = function(err, result) {
      ev.sender.send('pipeline-run-callback',err, result);
    }
    const processing = function() {
      ev.sender.send('pipeline-run-callback',null, { type : 'process' });
    }
    const startTime = (new Date()).toISOString();
    try{
      let pipeline = self.storage.get(arg.id);
      if(utils.isBlank(pipeline)) {
        return callback(new Error('Pipeline not found.'));
      }
      
      self.setPipeline(pipeline.id, {
        status : 'processing',
        started_at : startTime,
        completed_at : '',
        duration : ''
      });
      processing();
      
      // Mkdir pipeline cache folder
      //console.log('>>> pipeline', pipeline);
      const metadata = new Metadata();
      const pPath = metadata.mkdirPipelineFolder(pipeline.id);

      const logPath = path.join(pPath, 'pipeline.log');
      const pipelineLog = function(line) {
        line = moment().format('HH:mm:ss') + ' ' + line + '\n';
        fs.appendFileSync(logPath, line);
      }
      
      // Download metadata
      //console.log('>>>> Download metadata ', pPath);
      const connect = new Storage({ configName: 'connect' });
      const fromConn = connect.get(pipeline.from);
      const toConn = connect.get(pipeline.to);
      let client;
      if(fromConn.type == 'github') {
        client = new GithubApi(fromConn);
      } else if(fromConn.type == 'bitbucket') {
        client = new BitbucketApi(fromConn);
      } else if(fromConn.type == 'sfdc') {
        client = new SfdcApi(fromConn);
      }
      metadata.checkConnect(toConn)
      .then(function(success) {
        pipelineLog('[SF.api] Authorize : ' + success);
        return client.getFiles(pipeline, fromConn, pipelineLog);
      })
      .then(function(success) {
        // Generate package.xml file
        return metadata.createPackageXml(pPath);
      })
      .then(function() {
        pipelineLog('[Metadata] Generate package.xml Done.');
        // Zip Metadata 
        return metadata.archive(pPath);
      })
      .then(function(zipPath) {
        // Do Deploy
        return metadata.deploy(toConn, zipPath);
      })
      .then(function(deployResult) {
        // Save deploy result
        self.outputDeployLog(pipelineLog, deployResult);
        const now = new Date();
        const endTime = now.toISOString();
        const duration = utils.getDuration(endTime, startTime);
        self.setPipeline(pipeline.id, {
          status : (deployResult.success) ? 'successful' : 'failed',
          completed_at : endTime,
          duration : duration
        });
        return callback(null, deployResult);
      })
      .catch(function(err) {
        console.error('[ERROR] Run pipeline', err);
        const now = new Date();
        const endTime = now.toISOString();
        const duration = utils.getDuration(endTime, startTime);
        self.setPipeline(pipeline.id, {
          status : 'failed',
          completed_at : endTime,
          duration : duration
        });
        pipelineLog('[ERROR] Run pipeline : ' + err);
        return callback(err);
      });

    }catch(err) {
      console.error('[ERROR] Run pipeline', err);
      const now = new Date();
      const endTime = now.toISOString();
      const duration = utils.getDuration(endTime, startTime);
      self.setPipeline(arg.id, {
        status : 'failed',
        completed_at : endTime,
        duration : duration
      });
      pipelineLog('[ERROR] Run pipeline' + err);
      return callback(err);
    }

  }
  /**
   * Output metadata deploy result log
   * @param {Function} pipelineLog 
   * @param {Object} deployResult 
   */
  outputDeployLog(pipelineLog, deployResult) {
    pipelineLog('[Metadata] Deploy Done : ');
    pipelineLog('           Id: ' + deployResult.id);
    pipelineLog('           Success: ' + deployResult.success);
    pipelineLog('           Components Total: ' + deployResult.numberComponentsTotal);
    pipelineLog('           Components Error: ' + deployResult.numberComponentErrors);
    pipelineLog('           Components Deployed: ' + deployResult.numberComponentsDeployed);
    pipelineLog('           Tests Total: ' + deployResult.numberTestsTotal);
    pipelineLog('           Tests Error: ' + deployResult.numberTestErrors);
    pipelineLog('           Tests Completed: ' + deployResult.numberTestsCompleted);
  }

}

module.exports = Pipeline;