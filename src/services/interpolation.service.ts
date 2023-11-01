// @ts-nocheck
import moment from "moment";
import { singleton } from "tsyringe";

let page = 0;

const defaultModifiers = [
  {
    key: "uppercase",
    transform: (uppercase) => uppercase.toUpperCase(),
  },
  {
    key: "lowercase",
    transform: (lowercase) => lowercase.toLowerCase(),
  },
  {
    key: "title",
    transform: (title) =>
      title.replace(
        /\w\S*/g,
        (s) => s.charAt(0).toUpperCase() + s.substr(1).toLowerCase()
      ),
  },
  {
    key: "moment",
    transform: (val, data) => {
      const date = val.match(/(\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}\/\d{4})/)
        ? val
        : data.env[val];
      return moment(date, ["YYYY-MM-DD", "DD/MM/YYYY"]);
    },
  },
  {
    key: "subDay",
    transform: (val, data) => moment(val).subtract(1, "d"),
  },
  {
    key: "DDMMYYYY",
    transform: (val, data) => {
      return val.format("DDMMYYYY");
    },
  },
  {
    key: "DD/MM/YYYY",
    transform: (val, data) => {
      return val.format("DD/MM/YYYY");
    },
  },
  {
    key: "YYYY-MM-DD",
    transform: (val, data) => {
      return val.format("YYYY-MM-DD");
    },
  },
  {
    key: "YYYYMMDD",
    transform: (val, data) => {
      return val.format("YYYYMMDD");
    },
  },
  {
    key: "date_sub_day",
    transform: (val, data) => {
      return moment(new Date()).subtract(val, "day");
    },
  },
  {
    key: "date_sub_month",
    transform: (val, data) => {
      return moment(new Date()).subtract(val, "month");
    },
  },
  {
    key: "page",
    transform: (val, data) => {
      page = page + (val || 1);
      return page;
    },
  },
];

const defaultOptions = {
  delimiter: ["{", "}"],
};

const getArrayKeyIndex = (val) => {
  // Find values between []
  const matchArrayIndex = val.match(/\[(.*?)\]/);
  if (matchArrayIndex) {
    return {
      index: matchArrayIndex[1],
      key: val.replace(matchArrayIndex[0], ""),
    };
  }
  return val;
};

const getValueFromObject = (value, data) => {
  try {
    const valuesToPull = value.split(".");
    while (valuesToPull.length) {
      const testValue = getArrayKeyIndex(valuesToPull.shift());
      if (typeof testValue === "object") {
        if (testValue.index && testValue.key) {
          data = data[testValue.key][testValue.index];
        }
      } else {
        data = data[testValue];
      }
    }
    return data;
  } catch (e) {
    return "";
  }
};

class Interpolator {
  private aliases: [];
  private modifiers: [];

  constructor(private readonly options = defaultOptions) {
    this.options = options;
    this.modifiers = [];
    this.aliases = [];
    this.registerBuiltInModifiers();
  }

  registerBuiltInModifiers() {
    defaultModifiers.forEach((modifier) =>
      this.registerModifier(modifier.key, modifier.transform)
    );
    return this;
  }

  get delimiter() {
    return this.options.delimiter;
  }

  delimiterStart() {
    return this.options.delimiter[0];
  }

  delimiterEnd() {
    return this.options.delimiter[1];
  }

  registerModifier(key, transform) {
    if (!key) {
      return new Error("Modifiers must have a key");
    }

    if (typeof transform !== "function") {
      return new Error(
        "Modifiers must have a transformer. Transformers must be a function that returns a value."
      );
    }

    this.modifiers.push({ key: key.toLowerCase(), transform });
    return this;
  }

  parseRules(str) {
    const regex = `${this.delimiterStart()}([^}]+)${this.delimiterEnd()}`;
    const execRegex = new RegExp(regex, "gi");
    const matches = str.match(execRegex);

    // const parsableMatches = matches.map((match) => ({ key: removeDelimiter(match), replaceWith: match }));
    return matches ? this.extractRules(matches) : [];
  }

  extractRules(matches) {
    return matches.map((match) => {
      const alternativeText = this.getAlternativeText(match);
      const modifiers = this.getModifiers(match);
      return {
        key: this.getKeyFromMatch(match),
        replace: match,
        modifiers,
        alternativeText,
      };
    });
  }

  getKeyFromMatch(match) {
    const removeReservedSymbols = [":", "|"];
    return this.removeDelimiter(
      removeReservedSymbols.reduce(
        (val, sym) => (val.indexOf(sym) > 0 ? this.removeAfter(val, sym) : val),
        match
      )
    );
  }

  removeDelimiter(val) {
    return val
      .replace(new RegExp(this.delimiterStart(), "g"), "")
      .replace(new RegExp(this.delimiterEnd(), "g"), "");
  }

  removeAfter(str, val) {
    return str.substring(0, str.indexOf(val));
  }

  extractAfter(str, val) {
    return str.substring(str.indexOf(val) + 1);
  }

  getAlternativeText(str) {
    if (str.indexOf(":") > 0) {
      const altText = this.removeDelimiter(this.extractAfter(str, ":"));
      if (altText.indexOf("|") > 0) {
        return this.removeAfter(altText, "|");
      }
      return altText;
    }

    return "";
  }

  getModifiers(str) {
    if (str.indexOf("|") > 0) {
      const strModifiers = this.removeDelimiter(
        this.extractAfter(str, "|")
      ).split(",");
      return strModifiers.map((modifier) =>
        this.getModifier(modifier.toLowerCase())
      );
    }

    return [];
  }

  parse(str = "", data = {}) {
    const rules = this.parseRules(str);
    if (rules && rules.length > 0) {
      return this.parseFromRules(str, data, rules);
    }

    return str;
  }

  parseFromRules(str, data, rules) {
    return rules.reduce(
      (reducedStr, rule) => this.applyRule(reducedStr, rule, data),
      str
    );
  }

  applyRule(str, rule, data = {}) {
    const dataToReplace = this.applyData(rule.key, data);
    if (dataToReplace) {
      return str.replace(
        rule.replace,
        this.applyModifiers(rule.modifiers, dataToReplace, data)
      );
    } else if (rule.alternativeText) {
      return str.replace(
        rule.replace,
        this.applyModifiers(rule.modifiers, rule.alternativeText, data)
      );
    }

    const defaultModifier = this.applyModifiers(rule.modifiers, rule.key, data);
    if (defaultModifier === rule.key) {
      return str.replace(rule.replace, "");
    }
    return str.replace(rule.replace, defaultModifier);
  }

  getFromAlias(key) {
    return this.aliases.find(
      (alias) => alias.key.toLowerCase() === key.toLowerCase()
    );
  }

  applyData(key, data) {
    const alias = this.getFromAlias(key);
    if (alias) {
      const value = getValueFromObject(alias.ref, data);
      if (value) {
        return value;
      }
    }
    return key.indexOf(".") > 0 || key.indexOf("[") > 0
      ? getValueFromObject(key, data)
      : data[key];
  }

  getModifier(key) {
    return this.modifiers.find((modifier) => modifier.key === key);
  }

  applyModifiers(modifiers, str, rawData) {
    try {
      const transformers = modifiers.map(
        (modifier) => modifier && modifier.transform
      );
      return transformers.reduce(
        (str, transform) => (transform ? transform(str, rawData) : str),
        str
      );
    } catch (e) {
      return str;
    }
  }

  addAlias(key, ref) {
    if (typeof ref === "function") {
      this.aliases.push({ key, ref: ref() });
    } else {
      this.aliases.push({ key, ref });
    }
    return this;
  }

  removeAlias(key) {
    this.aliases = this.aliases.filter((alias) => alias.key !== key);
    return this;
  }
}

@singleton()
export class InterpolationService {
  private data = {
    now: moment(),
    tomorrow: moment().add(1, "d"),
    yesterday: moment().subtract(1, "d"),
  };

  private readonly interpolator = new Interpolator({
    delimiter: ["{{", "}}", "{{ ", " }}"],
  });

  public interpolate(template: string, data: Record<string, any> = {}) {
    return this.interpolator.parse(template, { ...this.data, ...data });
  }

  public setPage = (value) => (page = value);
}
