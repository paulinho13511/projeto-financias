// Ponto de entrada do front. Liga os eventos de cada módulo e inicia a sessão.
import { initPrivacy } from "./ui/privacy.js";
import { wireNav } from "./ui/nav.js";
import { wireSession, startup } from "./ui/session.js";
import { wireAccount } from "./ui/account.js";
import { wireAdmin } from "./ui/admin.js";
import { wireNotifications } from "./ui/notifications.js";
import { wireForms, initForms } from "./actions/forms.js";
import { wireRecords } from "./actions/records.js";
import { wireFilters } from "./actions/filters.js";
import { wireExport } from "./actions/export.js";
import { wireImport } from "./actions/import.js";
import { wireChart } from "./views/inicio.js";
import { wireCalendar } from "./views/calendario.js";

initPrivacy();
initForms();
wireNav();
wireFilters();
wireForms();
wireRecords();
wireExport();
wireImport();
wireChart();
wireCalendar();
wireAccount();
wireAdmin();
wireNotifications();
wireSession();

startup();
