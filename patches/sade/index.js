const mri = require('mri');
const $ = require('./utils');

const ALL = '__all__';
const DEF = '__default__';

class Sade {
  constructor(name, isOne) {
    let [bin, ...rest] = name.split(/\s+/);
    isOne = isOne || rest.length > 0;

    this.bin = bin;
    this.ver = '0.0.0';
    this.default = '';
    this.tree = {};
    this.commandAliases = {};
    // set internal shapes;
    this.command(ALL);
    this.command([DEF].concat(isOne ? rest : '<command>').join(' '));
    this.single = isOne;
    this.curr = ''; // reset
  }

  command(str, desc, opts = {}) {
    if (this.single) {
      throw new Error('Disable "single" mode to add commands');
    }

    // All non-([|<) are commands
    let cmd = [],
      usage = [],
      rgx = /(\[|<)/;
    str.split(/\s+/).forEach((x) => {
      (rgx.test(x.charAt(0)) ? usage : cmd).push(x);
    });

    // Back to string~!
    cmd = cmd.join(' ');

    if ($.existsAsCommandAlias(cmd, this.commandAliases) || cmd in this.tree) {
      throw new Error(`Command already exists: ${cmd}`);
    }

    // re-include `cmd` for commands
    cmd.includes('__') || usage.unshift(cmd);
    usage = usage.join(' '); // to string

    this.curr = cmd;
    if (opts.default) this.default = cmd;

    const cmdData = {
      usage,
      options: [],
      alias: {},
      default: {},
      examples: [],
    };

    this.tree[cmd] = cmdData;
    this.commandAliases[cmd] = [].concat(opts.alias).filter(Boolean);

    if (desc) this.describe(desc);

    return this;
  }

  describe(str) {
    this.tree[this.curr || DEF].describe = Array.isArray(str)
      ? str
      : $.sentences(str);

    return this;
  }

  option(str, desc, val) {
    let cmd = this.tree[this.curr || ALL];

    let [flag, alias] = $.parse(str);
    if (alias && alias.length > 1) [flag, alias] = [alias, flag];

    str = `--${flag}`;
    if (alias && alias.length > 0) {
      str = `-${alias}, ${str}`;
      let old = cmd.alias[alias];
      cmd.alias[alias] = (old || []).concat(flag);
    }

    let arr = [str, desc || ''];

    if (val !== void 0) {
      arr.push(val);
      cmd.default[flag] = val;
    } else if (!alias) {
      cmd.default[flag] = void 0;
    }

    cmd.options.push(arr);

    return this;
  }

  action(handler) {
    const command = this.tree[this.curr || DEF];
    command.handler = handler;

    return this;
  }

  example(str) {
    const command = this.tree[this.curr || DEF];
    command.examples.push(str);

    return this;
  }

  version(str) {
    this.ver = str;
    return this;
  }

  parse(arr, opts = {}) {
    let offset = 2; // argv slicer
    let alias = { h: 'help', v: 'version' };
    let argv = mri(arr.slice(offset), { alias });
    let isSingle = this.single;
    let bin = this.bin;
    let tmp,
      name = '';
    let isVoid, cmd;

    if (isSingle) {
      cmd = this.tree[DEF];
    } else {
      // Loop thru possible command(s)
      let i = 1,
        len = argv._.length + 1;
      for (; i < len; i++) {
        tmp = argv._.slice(0, i).join(' ');

        const exists = $.existsAsCommandAlias(tmp, this.commandAliases);

        if (exists || tmp in this.tree) {
          name = tmp;
          offset = i + 2; // argv slicer
        }
      }

      // create commands from aliases for every command's alias
      $.createAliasCommands(this.tree, this.commandAliases);

      cmd = this.tree[name];
      isVoid = cmd === void 0;

      if (isVoid) {
        if (this.default) {
          name = this.default;
          cmd = this.tree[name];
          arr.unshift(name);
          offset++;
        } else if (tmp) {
          return $.error(bin, `Invalid command: ${tmp}`);
        } //=> else: cmd not specified, wait for now...
      }
    }

    // show main help if relied on "default" for multi-cmd
    if (argv.help) return this.help(!isSingle && !isVoid && name);
    if (argv.version) return this._version();

    if (!isSingle && cmd === void 0) {
      return $.error(bin, 'No command specified.');
    }

    let all = this.tree[ALL];
    // merge all objects :: params > command > all
    opts.alias = Object.assign(all.alias, cmd.alias, opts.alias);
    opts.default = Object.assign(all.default, cmd.default, opts.default);

    let vals = mri(arr.slice(offset), opts);
    if (!vals || typeof vals === 'string') {
      return $.error(bin, vals || 'Parsed unknown option flag(s)!');
    }

    let segs = cmd.usage.split(/\s+/);
    let reqs = segs.filter((x) => x.charAt(0) === '<');
    let args = vals._.splice(0, reqs.length);

    if (args.length < reqs.length) {
      if (name) bin += ` ${name}`; // for help text
      return $.error(bin, 'Insufficient arguments!');
    }

    segs
      .filter((x) => x.charAt(0) === '[')
      .forEach((_) => {
        args.push(vals._.shift()); // adds `undefined` per [slot] if no more
      });

    args.push(vals); // flags & co are last
    let handler = cmd.handler;
    return opts.lazy ? { args, name, handler } : handler.apply(null, args);
  }

  help(str) {
    console.log($.help(this, str || DEF));
  }

  _version() {
    console.log(`${this.bin}, ${this.ver}`);
  }
}

// FOOBAR
module.exports = (str, isOne) => new Sade(str, isOne);