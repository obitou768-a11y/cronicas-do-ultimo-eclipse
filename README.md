# Crônicas do Último Eclipse

RPG de fantasia sombria executado localmente com HTML, CSS e módulos JavaScript. Não requer instalação de dependências, imagens, conta ou serviço remoto. O conteúdo da história e a lógica permanecem disponíveis sem conexão; as fontes web têm alternativas locais.

## Iniciar

Requer Node.js 20 ou superior. No terminal do projeto:

```powershell
node server.js
```

Abra http://127.0.0.1:4173. O servidor local existe para servir os módulos ES com o mesmo comportamento de um servidor estático. O projeto também pode ser aberto pelo Live Server do VS Code. Encerre o servidor com `Ctrl+C`.

## Testar

```powershell
node --test
```

## Controles

- `1` Jornada, `2` Personagem, `3` Mapa, `4` Missões, `5` Inventário, `6` Companheiros, `7` Habilidades e `8` Crônica.
- `M` abre o mapa, `J` abre as missões e `Ctrl+S` salva.
- As ações de combate aparecem quando chega o turno de cada integrante. Chefes bloqueiam fuga; encontros comuns permitem tentar.
- Três espaços de salvamento usam o armazenamento local do navegador. Configurações de volume e texto também ficam neste dispositivo.

## Sistemas

O motor está separado em `js/character.js`, `js/combat.js`, `js/game.js`, `js/inventory.js`, `js/quests.js` e `js/save.js`; regiões, habilidades, personagens, inimigos, chefes, itens, receitas e missões ficam em `js/content.js`. A interface está em `js/main.js`; a folha de estilos é independente.

A versão contém oito regiões ligadas pela vitória nos chefes, 32 inimigos, oito chefes com mudanças de fase, quatro arquétipos, seis companheiros, 55 peças de equipamento, 20 missões secundárias, oito capítulos com cenas dialogadas e três finais. Decisões ficam no estado salvo, alteram recursos, afinidade, reputação, dificuldade ou o final. Materiais, receitas, atributos, níveis, pontos, loja, fabricação, melhoria de equipamento e encontros aleatórios têm efeito no jogo.

## Limites conhecidos

- As missões pessoais são concluídas ao derrotar o chefe associado após recrutar o companheiro; os diálogos e objetivos existem, mas não há cenas pessoais ramificadas por capítulo.
- Algumas regiões usam eventos textuais e encontros gerados por uma tabela; não há mapas táticos com deslocamento por tiles nem sprites externos.
- A música não vem em arquivos; há efeitos sonoros leves gerados pelo navegador e controle de volume. Se Web Audio não estiver disponível, o jogo continua normalmente.
- O catálogo define todos os oito chefes e suas fases. O teste de campanha automatizado percorre o prólogo e o primeiro chefe; a campanha completa e os demais finais ainda precisam de uma partida manual longa para verificação de balanceamento.