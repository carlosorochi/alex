#!/usr/bin/env node
'use strict'

var PassThrough = require('stream').PassThrough
var notifier = require('update-notifier')
var meow = require('meow')
var engine = require('unified-engine')
var unified = require('unified')
var markdown = require('remark-parse')
var frontmatter = require('remark-frontmatter')
var english = require('retext-english')
var remark2retext = require('remark-retext')
var report = require('vfile-reporter')
var equality = require('retext-equality')
var profanities = require('retext-profanities')
var diff = require('unified-diff')
var pack = require('./package')
var filter = require('./filter')

var extensions = [
  'txt',
  'text',
  'md',
  'markdown',
  'mkd',
  'mkdn',
  'mkdown',
  'ron'
]

// Update messages.
notifier({pkg: pack}).notify()

// Set-up meow.
var cli = meow(
  [
    'Usage: alex [<glob> ...] [options ...]',
    '',
    'Options:',
    '',
    '  -w, --why    output sources (when available)',
    '  -q, --quiet  output only warnings and errors',
    '  -t, --text   treat input as plain-text (not markdown)',
    '  -d, --diff   ignore unchanged lines (affects Travis only)',
    '  --stdin      read from stdin',
    '',
    'When no input files are given, searches for markdown and text',
    'files in the current directory, `doc`, and `docs`.',
    '',
    'Examples',
    '  $ echo "His network looks good" | alex --stdin',
    '  $ alex *.md !example.md',
    '  $ alex'
  ].join('\n'),
  {
    flags: {
      version: {type: 'boolean', alias: 'v'},
      help: {type: 'boolean', alias: 'h'},
      stdin: {type: 'boolean'},
      text: {type: 'boolean', alias: 't'},
      diff: {type: 'boolean', alias: 'd'},
      quiet: {type: 'boolean', alias: 'q'},
      why: {type: 'boolean', alias: 'w'}
    }
  }
)

// Set-up.
var defaultGlobs = ['{docs/**/,doc/**/,}*.{' + extensions.join(',') + '}']
var silentlyIgnore
var globs

if (cli.flags.stdin) {
  if (cli.input.length !== 0) {
    throw new Error('Do not pass globs with `--stdin`')
  }
} else if (cli.input.length === 0) {
  globs = defaultGlobs
  silentlyIgnore = true
} else {
  globs = cli.input
}

engine(
  {
    processor: unified(),
    files: globs,
    extensions: extensions,
    configTransform: transform,
    output: false,
    out: false,
    streamError: new PassThrough(),
    rcName: '.alexrc',
    packageField: 'alex',
    ignoreName: '.alexignore',
    silentlyIgnore: silentlyIgnore,
    frail: true,
    defaultConfig: transform()
  },
  function(err, code, result) {
    var out = report(err || result.files, {
      verbose: cli.flags.why,
      quiet: cli.flags.quiet
    })

    if (out) {
      console.error(out)
    }

    process.exit(code)
  }
)

function transform(options) {
  var settings = options || {}
  var plugins = [
    english,
    profanities,
    [equality, {noBinary: settings.noBinary}]
  ]

  if (!cli.flags.text) {
    plugins = [
      markdown,
      [frontmatter, ['yaml', 'toml']],
      [remark2retext, unified().use({plugins: plugins})]
    ]
  }

  plugins.push([filter, {allow: settings.allow}])

  /* istanbul ignore if - hard to check. */
  if (cli.flags.diff) {
    plugins.push(diff)
  }

  return {plugins: plugins}
}
