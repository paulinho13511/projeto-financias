// Ponto de entrada do front. Liga os eventos de cada módulo e inicia a sessão.
import { initPrivacy } from "./ui/privacy.js";
import { wireNav } from "./ui/nav.js";
import { wireSession, startup } from "./ui/session.js";
import { wireAccount } from "./ui/account.js";
import { wireAdmin } from "./ui/admin.js";
import { wireNotifications } from "./ui/notifications.js";
import { wireHome, initHome } from "./ui/home.js";
import { wireForms, initForms } from "./actions/forms.js";
import { wireRecords } from "./actions/records.js";
import { wireFilters } from "./actions/filters.js";
import { wireChart } from "./views/inicio.js";
import { wireCalendar } from "./views/calendario.js";
import { wireDonut } from "./views/categorias.js";

initPrivacy();
initForms();
wireNav();
wireFilters();
wireForms();
wireRecords();
wireChart();
wireCalendar();
wireDonut();
wireAccount();
wireAdmin();
wireNotifications();
wireHome();
wireSession();
initHome();

startup();
