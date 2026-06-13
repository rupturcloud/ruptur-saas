import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://axrwlboyowoskdxeogba.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF4cndsYm95b3dvc2tkeGVvZ2JhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzkzOTM1NiwiZXhwIjoyMDg5NTE1MzU2fQ.__rT-zda7XKt4fFXoz3wsdAEf6-CSGDfelgU5uo0_gE';

const supabase = createClient(supabaseUrl, supabaseServiceKey, { auth: { autoRefreshToken: false, persistSession: false }});

async function confirmUser() {
  const { data: { users }, error } = await supabase.auth.admin.listUsers();
  if (error) { console.error('Erro ao listar:', error); return; }
  
  const user = users.find(u => u.email === 'tiatendeai@gmail.com');
  if (!user) { console.log('Usuário não encontrado.'); return; }
  
  const { data, error: updateError } = await supabase.auth.admin.updateUserById(user.id, { email_confirm: true });
  if (updateError) console.error('Erro ao confirmar:', updateError);
  else console.log('Usuário confirmado com sucesso!', data.user.email);
}

confirmUser();
