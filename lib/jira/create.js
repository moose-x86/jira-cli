/*global requirejs,console,define,fs*/
define([
    'commander',
    'superagent',
    '../../lib/config',
], function(program, request, config) {

    var create = {
        query: null,
        table: null,
        isSubTask: false,
        projects: [],
        priorities: [],
        answers: {
            fields: {}
        },

        ask: function(question, callback, yesno, values, answer) {
            var that = this,
                options = options || {},
                issueTypes = [],
                i = 0;

            if (answer || answer === false) {
                return callback(answer);
            }
            if (values && values.length > 0) {
                for (i; i < values.length; i++) {
                    if (that.isSubTask) {
                        if (values[i].subtask !== undefined) {
                            if (values[i].subtask) {
                                issueTypes.push('(' + values[i].id + ') ' + values[i].name);
                            }
                        } else {
                            issueTypes.push('(' + values[i].id + ') ' + values[i].name);
                        }
                    } else {
                        if (!values[i].subtask) {
                            issueTypes.push('(' + values[i].id + ') ' + values[i].name);
                        }
                    }
                }
                console.log(issueTypes.join('\n'));
            }

            program.prompt(question, function(answer) {
                if (answer.length > 0) {
                    callback(answer);
                } else {
                    if (yesno) {
                        callback(false);
                    } else {
                        that.ask(question, callback);
                    }
                }
            }, options);
        },

        askProject: function(project, callback) {
            var that = this,
                i = 0;

            this.ask('Type the project name or key: ', function(answer) {
                var projectId = 0,
                    index = 0;

                answer = answer.charAt(0).toUpperCase() + answer.substring(1).toLowerCase();

                for (i; i < that.projects.length; i++) {
                    if (answer == that.projects[i].key || answer.toUpperCase() == that.projects[i].key) {
                        projectId = that.projects[i].id;
                        index = i;
                    } else if (answer == that.projects[i].name) {
                        projectId = that.projects[i].id;
                        index = i;
                    }
                }

                if (projectId > 0) {
                    callback(projectId, index);
                } else {
                    console.log('Project "' + answer + '" does not exists.');
                    that.askProject(project, callback);
                }
            }, null, null, project);
        },

        askSubTask: function(subtask, callback) {
            var that = this;

            that.ask('Type the parent task key (only the numbers) if exists, otherwise press enter: ', function(answer) {
                if (answer === false || parseInt(answer) > 0) {
                    that.isSubTask = (answer) ? true : false;
                    callback(answer);
                } else {
                    console.log('Please, type only the task number (ex: if issue is "XXX-324", type only "324").');
                    that.askSubTask(subtask, callback);
                }
            }, true, null, subtask);
        },

        askIssueType: function(type, callback) {
            var that = this,
                issueTypeArray = that.project.issuetypes;

            that.ask('Select issue type: ', function(issueType) {
                callback(issueType);
            }, false, issueTypeArray, type);
        },

        askIssuePriorities: function(priority, callback) {
            var that = this,
                issuePriorities = that.priorities;


            that.ask('Select the priority: ', function(issuePriority) {
                callback(issuePriority);
            }, false, issuePriorities, priority);
        },

        newIssue: function(projIssue, options) {
            var that = this;
            var project = typeof(projIssue) === 'string' ? projIssue : undefined;
            var parent = undefined;
            if (project !== undefined) {
                var split = project.split('-');
                project = split[0];
                if (split.length > 1) {
                    parent = split[1];
                    console.log("Creating subtask for issue " + projIssue);
                } else {
                    console.log("Creating issue in project " + project);
                }
            }

            this.createIssueForProject = function createIssueForProject(that) {
                that.askIssueType(options.type, function(issueTypeId) {
                    that.answers.fields.issuetype = {
                        id: issueTypeId
                    };

                    that.ask('Issue Summary: ', function(issueSummary) {
                        that.answers.fields.summary = issueSummary;
                        that.ask('Issue description: ', function(issueDescription) {
                            that.answers.fields.description = issueDescription || issueSummary;

                            that.askIssuePriorities(options.priority, function(issuePriority) {
                                that.answers.fields.priority = {
                                    id: issuePriority
                                };

                                that.ask('Issue assignee (Enter for none): ', function(assignee) {
                                    if (assignee) {
                                        that.answers.fields.assignee = {
                                            name: assignee == "me" ? config.auth.user : assignee
                                        }
                                    }

                                    that.saveIssue(options,function(res) {
                                        that.ask('Create another issue? [y/N] ', function(answer) {
                                            if (answer && answer.toLowerCase()[0] == 'y') {
                                                that.createIssueForProject(that);
                                            } else {
                                                process.stdin.destroy();
                                            }
                                        }, true);
                                    });
                                }, true, [], {
                                    user: {
                                        enabled: true
                                    }
                                }, options.assignee);

                            });
                        }, true, null, options.description);
                    }, null, null, options.summary);
                });
            }

            this.getMeta(function(meta) {
                that.projects = meta;

                that.askProject(options.project, function(projectId, index) {
                    that.project = that.projects[index];
                    that.answers.fields.project = {
                        id: projectId
                    };
                    if (!options.subtask && (options.priority || options.type || options.summary || options.description)) {
                        options.subtask = false;
                    }
                    that.askSubTask(options.subtask, function(taskKey) {
                        if (taskKey) {
                            that.answers.fields.parent = {
                                key: that.project.key + '-' + taskKey
                            };
                        }

                        that.askIssueType(options.type, function(issueTypeId) {
                            that.answers.fields.issuetype = {
                                id: issueTypeId
                            };

                            that.ask('Type the issue summary: ', function(issueSummary) {
                                that.answers.fields.summary = issueSummary;

                                that.ask('Type the issue description: ', function(issueDescription) {
                                    var defaultAnswer = issueSummary;
                                    if (!issueDescription) {
                                        that.answer.fields.description = defaultAnswer;
                                    } else {
                                        that.answers.fields.description = issueDescription;
                                    }
                                    process.stdin.destroy();
                                    that.saveIssue(options);

                                }, null, null, options.description);
                            }, null, null, options.summary);
                        });
                    });
                });
            });
        },

        getMeta: function(callback) {
            this.query = 'rest/api/2/project';
            request
                .get(config.auth.url + this.query)
                .set('Content-Type', 'application/json')
                .set('Authorization', 'Basic ' + config.auth.token)
                .end((err, res) => {
                    if (!res.ok) {
                        return console.log((res.body.errorMessages || [res.error]).join('\n'));
                    }
                    callback(res.body.projects);
                });
        },

        getPriorities: function(callback) {
            this.query = 'rest/api/2/priority';

            request
                .get(config.auth.url + this.query)
                .set('Content-Type', 'application/json')
                .set('Authorization', 'Basic ' + config.auth.token)
                .end((err, res) => {
                    if (!res.ok) {
                        return console.log(res.body.errorMessages.join('\n'));
                    }
                    callback(res.body);
                });
        },

        saveIssue: function(options) {
            this.query = 'rest/api/2/issue';
            url = config.auth.url + this.query;
            if (options.verbose) {
                console.log(url);
                console.log(JSON.stringify(this.answers));
            }
            request
                .post(url)
                .send(JSON.stringify(this.answers))
                .set('Content-Type', 'application/json')
                .set('Authorization', 'Basic ' + config.auth.token)
                .end((err, res) => {
                    if (!res.ok) {
                        return console.log(res.body.errorMessages.join('\n'));
                    }
                    if (options.verbose) {
                        console.log(res);
                    }

                    return console.log('Issue ' + res.body.key + ' created successfully!');

                });
        }
    };

    return create;

});
