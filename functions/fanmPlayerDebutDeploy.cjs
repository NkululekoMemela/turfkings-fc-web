const all = require("./index.js");
for (const name of ["onClubPlayerDebut","onFieldPlayerDebut","onArchivedFieldPlayerDebut","preparePlayerDebuts"]) exports[name] = all[name];
