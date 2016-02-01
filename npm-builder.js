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

    .boolean('nocache')
    .describe('nocache', 'Disable config cache.')

	.boolean('help')
	.describe('help', 'Show this page.')
	.usage('npm-builder -u [ username ]  -t [ template ] --nocache')

	argv = opt.argv,
    
    S = require('string'),
    sf = require('switch-factory'),
    file = require('file'),
    path = require('path'),
    Mustache = require('mustache'),
    glob = require('glob'),
    async = require('async'),
    request = require('request'),
    homedir = require('homedir'),
    spawn = require('child_process').spawn,
    fs = require('fs');

    var t = argv.t;

    if(t !== 'npm-builder-template' && S(t).startsWith('~')) {
        t = 'nbt-' + t;
    }

    var link = 'https://github.com/' + argv.u + '/' + t,
        gi = 'https://raw.githubusercontent.com/' + argv.u + '/' + t + '/master/.gitignore',
        travis = 'https://raw.githubusercontent.com/' + argv.u + '/' + t + '/master/.travis.yml',
        tarball = link + '/tarball/master',
        packRead = sf.is(['package.json', 'README.md', '.git']),
        mSet = '{{=y- -x=}}',
        cache = !argv.nocache,
        cacheDir = path.join(homedir(), '.npm-builder');

var issh = function(fn) {
    var s, l;

    if((typeof fn == 'string') && (fn.length > 3)) {
        s = fn.split('');
        l = s.length;

        return ((s[l - 3] === '.') && (s[l - 2] === 's') && (s[l - 1] === 'h'));
    } else {
        return false;
    }
};

var cached = function(url, cb) {
    var urlCached = path.join(cacheDir, S(url).slugify().s),
        useCb = typeof cb === 'function',
        req;

    if(cache && fs.existsSync(urlCached)) {
        if(useCb) {
            fs.readFile(urlCached, cb);
        } else {
            req = fs.createReadStream(urlCached);
        }
    } else {
        req = request(url, function(err, res, body) {
            if(useCb) {
                cb(err, new Buffer(body, 'utf8'));
            }
        });

        if(cache) {
            req.pipe(fs.createWriteStream(urlCached));
        }
    }

    return req;
};

if(cache) {
    if(!fs.existsSync(cacheDir)) {
        fs.mkdirSync(cacheDir);
    }
}

if(argv.help) {
    opt.showHelp();
} else {
    var rdMe = S(fs.readFileSync('README.md', 'utf8')).lines(),
        firstLine = (function(firstLine) {
                var chars = firstLine.split('');

                chars.shift();
                chars.shift();

                return chars.join('');
            }(rdMe[0])),
        template = {
            "name": firstLine,
            "Name": (function(str) {
                var f = str.charAt(0).toUpperCase();
                return f + str.substr(1);
            })(S(firstLine).camelize().s), //1337 name
            "description": rdMe[1],
            "user": argv.u
        },
        req = cached(tarball),
        tar = spawn('tar', ['-zx']);

    tar.on('exit', function(code) {
        if(code === 0) {
            fs.readdir('.', function(err, files) {
                files = (function(files) { //scrub garbage from folder
                    var scrub = sf.is(['.DS_Store', 'Thumbs.db', '.c9']); //stuff to scrub

                    return files.filter(function(file) {
                        return !scrub(file);
                    });
                })(files);

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
                            var rm = spawn('rm', ['-rf', packRead(files[0]) ? (packRead(files[1]) ? files[2] : files[1]) : files[0]]),
                                cgi, ctravis;

                            async.auto({
                                'rm': function(cb) {
                                    rm.on('exit', function(code) {
                                        if(code === 0) {
                                            cb();
                                        } else {
                                            cb('rm error')
                                        }
                                    });
                                },
                                'cgi': function(cb) {
                                    cached(gi, function(err, data) {
                                        if(err) {
                                            cb(err);
                                        } else {
                                            cgi = data;
                                            cb();
                                        }
                                    });
                                },
                                'ctravis': function(cb) {
                                  cached(travis, function(err, data) {
                                        if(err) {
                                            cb(err);
                                        } else {
                                            ctravis = data;
                                            cb();
                                        }
                                    });
                                },
                                'travis': ['rm', 'ctravis', function(cb) {
                                    fs.writeFile('.travis.yml', ctravis, 'utf8', cb);
                                }],
                                'gitignore': ['rm', 'cgi', function(cb) {
                                    fs.writeFile('.gitignore', Mustache.render(cgi.toString('utf8'), template), 'utf8', cb);
                                }],
                                'readme': ['rm', function(cb) {
                                    fs.readFile('README.md', 'utf8', function(err, data) {
                                        if(err) {
                                            cb(err);
                                        } else {
                                            fs.writeFile('README.md', Mustache.render(data, template), 'utf8', cb);
                                        }
                                    });
                                }],
                                'package': ['rm', function(cb) {
                                    fs.readFile('package.json', 'utf8', function(err, data) {
                                        if(err) {
                                            cb(err);
                                        } else {
                                            fs.writeFile('package.json', Mustache.render(data, template), 'utf8', cb);
                                        }
                                    });
                                }],
                                'walker': ['rm', function(cb) {
                                    file.walk('.', function(err, d, dd, f) {
                                        async.each(f, function(v, cb) {
                                            if(!packRead(v) && v.indexOf('.git') !== 0) {
                                                var fn = Mustache.render(mSet + v, template);

                                                fs.readFile(v, 'utf8', function(err, data) {
                                                    if(err) {
                                                        cb(err);
                                                    } else {
                                                        spawn('rm', [v]).on('exit', function(code) { //remove old files THEN >>
                                                            if(code === 0) {
                                                                fs.writeFile(fn, Mustache.render(data, template), 'utf8', function(err) {
                                                                    if(err) {
                                                                        cb(err);
                                                                    } else if(issh(v)) {
                                                                        fs.chmod(v, 0755, cb); //make sh files executable
                                                                    } else {
                                                                        cb();
                                                                    }
                                                                });
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
                                }]
                            }, function(err) {
                                if(err) {
                                    console.error(err);
                                }
                            });
                        } else {
                            console.log('Error code: ', err);
                        }
                    });
                } else {
                    console.error('Error: ', err, 'Files length is ' + files.length, files);
                }
            });
        }
    });
    
    req.pipe(tar.stdin);
    tar.stderr.pipe(process.stdout);
}
