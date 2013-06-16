/* npm-builder
 * Stop the copy paste madness. Set up your repo with one command.
 * (c) 2013 David (daXXog) Volm ><> + + + <><
 * Released under Apache License, Version 2.0:
 * http://www.apache.org/licenses/LICENSE-2.0.html  
 */

var opt = require('optimist')
    .alias('u', 'user')
	.describe('u', 'Github username.')
	.default('u', 'daxxog')
    
    .alias('t', 'template')
    .describe('t', 'Template repo name.')
	.default('t', 'npm-builder-template')

	.boolean('help')
	.describe('help', 'Show this page.')
	.usage('npm-builder -u [ username ]  -t [ template ]'),

	argv = opt.argv,
    
    S = require('string'),
    sf = require('switch-factory'),
    file = require('file'),
    Mustache = require('mustache'),
    glob = require('glob'),
    async = require('async'),
    request = require('request'),
    spawn = require('child_process').spawn,
    fs = require('fs');

    var link = 'https://github.com/' + argv.u + '/' + argv.t,
        tarball = link + '/tarball/master',
        packRead = sf.is(['package.json', 'README.md', '.git']),
        mSet = '{{=y- -x=}}';

if(argv.help) {
    opt.showHelp();
} else {
    var rdMe = S(fs.readFileSync('README.md', 'utf8')).lines(),
        template = {
            "name": rdMe[0],
            "Name": (function(str) {
                var f = str.charAt(0).toUpperCase();
                return f + str.substr(1);
            })(S(rdMe[0]).camelize().s), //1337 name
            "description": rdMe[3],
            "user": argv.u
        },
        req = request(tarball),
        tar = spawn('tar', ['-zx']);
    
    tar.on('exit', function(code) {
        if(code === 0) {
            fs.readdir('.', function(err, files) {
                if(!err && files.length === 3) {
                    async.each(glob('*/*', {sync: true}), function(file, cb) {
                        var cp = spawn('cp', ['-r', file, '.']);
                            
                        cp.on('exit', function(code) {
                            if(code === 0) {
                                cb();
                            } else {
                                cb(code);
                            }
                        });
                        
                        cp.stderr.pipe(process.stdout);
                    }, function(err) {
                        if(!err) {
                            var rm = spawn('rm', ['-rf', packRead(files[0]) ? (packRead(files[1]) ? files[2] : files[1]) : files[0]]);
                            
                            rm.on('exit', function(code) {
                                if(code === 0) {
                                    async.parallel({
                                        'readme': function(cb) {
                                            fs.readFile('README.md', 'utf8', function(err, data) {
                                                if(err) {
                                                    cb(err);
                                                } else {
                                                    fs.writeFile('README.md', Mustache.render(data, template), 'utf8', cb);
                                                }
                                            });
                                        },
                                        'package': function(cb) {
                                            fs.readFile('package.json', 'utf8', function(err, data) {
                                                if(err) {
                                                    cb(err);
                                                } else {
                                                    fs.writeFile('package.json', Mustache.render(data, template), 'utf8', cb);
                                                }
                                            });
                                        },
                                        'walker': function(cb) {
                                            file.walk('.', function(err, d, dd, f) {
                                                async.each(f, function(v, cb) {
                                                    if(!packRead(v) && v.indexOf('.git') !== 0) {
                                                        var fn = Mustache.render(mSet + v, template);
                                                        
                                                        fs.readFile(v, 'utf8', function(err, data) {
                                                            if(err) {
                                                                cb(err);
                                                            } else {
                                                                spawn('rm', [v]);
                                                                
                                                                fs.writeFile(fn, Mustache.render(data, template), 'utf8', function(err) {
                                                                    if(err) {
                                                                        cb(err);
                                                                    } else {
                                                                        cb();
                                                                    }
                                                                });
                                                            }
                                                        });
                                                    } else {
                                                        cb();
                                                    }
                                                }, function(err) {
                                                    if(err) {
                                                        console.error(err);
                                                    }
                                                });
                                            });
                                            
                                            cb();
                                        }
                                    }, function(err) {
                                        if(err) {
                                            console.error(err);
                                        }
                                    });
                                }
                            });
                            
                            rm.stderr.pipe(process.stdout);
                        } else {
                            console.log('Error code: ', err);
                        }
                    });
                } else {
                    console.error('Error: ', err, 'Files length is ' + files.length);
                }
            });
        }
    });
    
    req.pipe(tar.stdin);
    tar.stderr.pipe(process.stdout);
}