/**
 * Metadata class 
 */
var path       = require('path');
var archiver = require('archiver');
var fs = require('fs');
var sgp = require('sfdc-generate-package');

class Metadata {

  /**
   * Auto generate package.xml 
   * @param {String} directoryToSave file structure root path('output/' )
   * @param {String} sha Of commit ('95241a71b59af9b45de029ae86624fc26edb700a')
   * @param {List} files - the PR file list
   * @return {Promise}
   */
  createPackageXml(directoryToSave, shaOfCommit, prFiles) {

    const makeDir = require("make-dir");

    return new Promise(function(resolve, reject) {
      if (!prFiles) {
        return reject(new Error('File not exist'));
      }

      var pkg_dirStr = path.join(__dirname, directoryToSave + 'src/' + 'package.xml');
      // var pkg_dirStrWithouFileName = pkg_dirStr.substring(0, pkg_dirStr.lastIndexOf("\\"));
      // salesforce-delivery-tool-master\output\src
      var pkg_dirStrWithouFileName = path.dirname(pkg_dirStr);
      sgp({
        'src': pkg_dirStrWithouFileName, // salesforce src directory path : ./src
        'apiVersion':'40.0', // salesforce API verion : 40.0
        'output': pkg_dirStrWithouFileName // package output directory path : ./src
      }, console.log);

      resolve();
    });

  };

  /**
   * Auto generate package.xml 
   * @param {String} directoryToZip (zip file root path('output/' )
   * @param {String} zipFileDestination (zip file destination path
   * @param {String} filename (zip filename)
   * @param {String} ext (.zip)
   * @return {Promise}
   */
  zipDirectory(directoryToZip, zipFileDestination, filename, ext) {
    return new Promise(function(resolve, reject) {

      if (!directoryToZip) {
        return reject(new Error('Missing directory to zip'));
      }

      if (filename === undefined) {
        filename = 'unpacked';
      }

      if (ext === undefined) {
        ext = 'zip';
      }
      var cwd = process.cwd();
      // logger.debug('\n\n\n\n-----=======> CHANGING DIRECTORY');
      process.chdir(path.join(directoryToZip));
      var output = fs.createWriteStream(path.join(zipFileDestination, filename+'.'+ext));
      var archive = archiver('zip');

      output.on('close', function () {
        process.chdir(cwd);
        resolve();
      });

      archive.on('error', function(err){
        logger.error('error creating zip file');
        logger.error(err);
        process.chdir(cwd);
        reject(new Error('unable to create zip file'));
      });

      archive.pipe(output);

      archive.directory(directoryToZip, false);
      archive.finalize();
    });
  };

  /**
   * Deploys zipStream to project's sfdcClient
   * @param  {Stream} zipStream - zipped deployment
   * @return {[type]}           [description]
   */
  deployStream(sfdcDestinationConn, zipStream, opts) {
    var self = this;
    var deployOptions = opts || {};
    deployOptions.rollbackOnError = true;
    return new Promise(function(resolve, reject) {
      sfdcDestinationConn.deploy(zipStream, deployOptions)
        .then(function(result) {
          resolve(result);
        })
        .catch(function(error) {
          reject(error);
        })
        .done();
    });
  };
}

module.exports = Metadata;