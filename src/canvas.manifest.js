export const manifest = {
  screens: {
    scr_xukjis: { name: "Início", route: "/inicio", position: { "x": 160, "y": 220 } },
    scr_8i0rrq: { name: "Início · primeiro acesso", route: "/inicio-primeiro-acesso", position: { "x": 1560, "y": 220 } },
    scr_im5d8s: { name: "Agenda · Dia", route: "/agenda", state: { "agendaView": "dia" }, position: { "x": 160, "y": 2200 } },
    scr_0bccgk: { name: "Agenda · Semana", route: "/agenda", state: { "agendaView": "semana" }, position: { "x": 1560, "y": 2200 } },
    scr_ag7mes: { name: "Agenda · Mês", route: "/agenda", state: { "agendaView": "mes" }, position: { "x": 2960, "y": 2200 } },
    scr_5junqn: { name: "Conversas", route: "/conversas", position: { "x": 160, "y": 4180 } },
    scr_60369u: { name: "Clientes", route: "/clientes", position: { "x": 160, "y": 6160 } },
    scr_2erqme: { name: "Ficha do cliente", route: "/clientes/ana-ribeiro", position: { "x": 1560, "y": 6160 } },
    scr_o9z6t8: { name: "Clientes · Pacotes", route: "/clientes/pacotes", position: { "x": 2960, "y": 6160 } },
    scr_yegw80: { name: "Oportunidades · Precisa de você", route: "/oportunidades", state: { "opportunitySituation": "precisa" }, position: { "x": 160, "y": 8140 } },
    scr_43ba9l: { name: "Oportunidades · Está cuidando", route: "/oportunidades", state: { "opportunitySituation": "cuidando" }, position: { "x": 1560, "y": 8140 } },
    scr_vuxboi: { name: "Oportunidades · Resolvidos", route: "/oportunidades", state: { "opportunitySituation": "resolvidos" }, position: { "x": 2960, "y": 8140 } },
    scr_fgrses: { name: "Oportunidades · Sem clientes", route: "/oportunidades", state: { "opportunityDemo": "sem-clientes" }, position: { "x": 4360, "y": 8140 } },
    scr_4j5zej: { name: "Resultados · Gerado pela IA", route: "/resultados", state: { "resultadosTab": "gerado-ia" }, position: { "x": 160, "y": 10120 } },
    scr_5dblzp: { name: "Resultados · Recebimentos", route: "/resultados", state: { "resultadosTab": "recebimentos" }, position: { "x": 1560, "y": 10120 } },
    scr_uj1a7e: { name: "IA Orniplaty · Empresa", route: "/atendente-ia/empresa", position: { "x": 160, "y": 12100 } },
    scr_yypfmv: { name: "IA Orniplaty · Como atender", route: "/atendente-ia/como-atender", position: { "x": 1560, "y": 12100 } },
    scr_88mpof: { name: "IA Orniplaty · Conhecimento", route: "/atendente-ia/conhecimento", position: { "x": 2960, "y": 12100 } },
    scr_ycb5lg: { name: "IA Orniplaty · Nível de IA", route: "/atendente-ia/nivel", position: { "x": 4360, "y": 12100 } },
    scr_3e6wms: { name: "IA Orniplaty · Automações", route: "/atendente-ia/automacoes", position: { "x": 5760, "y": 12100 } },
    scr_gyxc4q: { name: "Serviços e equipe · Serviços", route: "/servicos-equipe", state: { "servicosTab": "servicos" }, position: { "x": 160, "y": 14080 } },
    scr_g82puj: { name: "Serviços e equipe · Equipe", route: "/servicos-equipe", state: { "servicosTab": "equipe" }, position: { "x": 1560, "y": 14080 } },
    scr_imh279: { name: "Serviços e equipe · Funcionamento", route: "/servicos-equipe", state: { "servicosTab": "funcionamento" }, position: { "x": 2960, "y": 14080 } },
    scr_cfg0vg: { name: "Configurações · Visão geral", route: "/configuracoes", state: { "configSection": "geral" }, position: { "x": 5760, "y": 16060 } },
    scr_g2lx49: { name: "Configurações · WhatsApp", route: "/configuracoes", state: { "configSection": "whatsapp" }, position: { "x": 160, "y": 16060 } },
    scr_k20fkd: { name: "Configurações · Plano", route: "/configuracoes", state: { "configSection": "plano" }, position: { "x": 1560, "y": 16060 } },
    scr_ff3zv3: { name: "Configurações · Conta", route: "/configuracoes", state: { "configSection": "conta" }, position: { "x": 2960, "y": 16060 } },
    scr_dnxn70: { name: "Configurações · Ajuda", route: "/configuracoes", state: { "configSection": "ajuda" }, position: { "x": 4360, "y": 16060 } }
  },
  sections: {
    sec_jz9my3: { name: "Início", x: 0, y: 0, width: 2920, height: 1180 },
    sec_ixek6n: { name: "Agenda", x: 0, y: 1980, width: 4320, height: 1180 },
    sec_nz55g5: { name: "Conversas", x: 0, y: 3960, width: 1520, height: 1180 },
    sec_dgil48: { name: "Clientes", x: 0, y: 5940, width: 4320, height: 1180 },
    sec_9bmmn8: { name: "Oportunidades", x: 0, y: 7920, width: 5720, height: 1180 },
    sec_94wd3a: { name: "Resultados", x: 0, y: 9900, width: 2920, height: 1180 },
    sec_keiw3g: { name: "IA Orniplaty", x: 0, y: 11880, width: 7120, height: 1180 },
    sec_xislz9: { name: "Serviços e equipe", x: 0, y: 13860, width: 4320, height: 1180 },
    sec_sg9ps5: { name: "Configurações", x: 0, y: 15840, width: 7120, height: 1180 }
  },
  layers: [
  { kind: "section", id: "sec_jz9my3", children: [
    { kind: "screen", id: "scr_xukjis" },
    { kind: "screen", id: "scr_8i0rrq" }]
  },
  { kind: "section", id: "sec_ixek6n", children: [
    { kind: "screen", id: "scr_im5d8s" },
    { kind: "screen", id: "scr_0bccgk" },
    { kind: "screen", id: "scr_ag7mes" }]
  },
  { kind: "section", id: "sec_nz55g5", children: [
    { kind: "screen", id: "scr_5junqn" }]
  },
  { kind: "section", id: "sec_dgil48", children: [
    { kind: "screen", id: "scr_60369u" },
    { kind: "screen", id: "scr_2erqme" },
    { kind: "screen", id: "scr_o9z6t8" }]
  },
  { kind: "section", id: "sec_9bmmn8", children: [
    { kind: "screen", id: "scr_yegw80" },
    { kind: "screen", id: "scr_43ba9l" },
    { kind: "screen", id: "scr_vuxboi" },
    { kind: "screen", id: "scr_fgrses" }]
  },
  { kind: "section", id: "sec_94wd3a", children: [
    { kind: "screen", id: "scr_4j5zej" },
    { kind: "screen", id: "scr_5dblzp" }]
  },
  { kind: "section", id: "sec_keiw3g", children: [
    { kind: "screen", id: "scr_uj1a7e" },
    { kind: "screen", id: "scr_yypfmv" },
    { kind: "screen", id: "scr_88mpof" },
    { kind: "screen", id: "scr_ycb5lg" },
    { kind: "screen", id: "scr_3e6wms" }]
  },
  { kind: "section", id: "sec_xislz9", children: [
    { kind: "screen", id: "scr_gyxc4q" },
    { kind: "screen", id: "scr_g82puj" },
    { kind: "screen", id: "scr_imh279" }]
  },
  { kind: "section", id: "sec_sg9ps5", children: [
    { kind: "screen", id: "scr_g2lx49" },
    { kind: "screen", id: "scr_k20fkd" },
    { kind: "screen", id: "scr_ff3zv3" },
    { kind: "screen", id: "scr_dnxn70" },
    { kind: "screen", id: "scr_cfg0vg" }]
  }]

};