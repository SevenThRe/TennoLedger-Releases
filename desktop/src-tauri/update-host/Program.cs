using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Threading;
using System.Web.Script.Serialization;
class UpdateHost {
 public class Entry { public string path; public string sha256; public string before; public long size; }
 public class Plan { public int parent; public string root; public string token; public string version; public Entry[] files; public Entry[] remove; }
 static string Hash(string p) {using(var f=File.OpenRead(p))using(var h=SHA256.Create())return BitConverter.ToString(h.ComputeHash(f)).Replace("-","").ToLowerInvariant();}
 static void NoLinks(string p) {for(var d=new DirectoryInfo(p);d!=null;d=d.Parent)if(d.Exists&&(d.Attributes&FileAttributes.ReparsePoint)!=0)throw new IOException("Linked update directory");}
 static string Target(string root,string rel) {
  if(String.IsNullOrEmpty(rel)||rel.Contains("\\")||rel.Contains(":"))throw new IOException("Invalid update path");
  if(rel!="myframe-desktop.exe"&&!rel.StartsWith("collector/")&&!rel.StartsWith("helper/"))throw new IOException("Unexpected update path");
  foreach(var part in rel.Split('/')) if(part==""||part=="."||part==".."||part.EndsWith(".")||part.EndsWith(" ")||part.IndexOfAny(Path.GetInvalidFileNameChars())>=0)throw new IOException("Invalid path segment");
  var dest=Path.GetFullPath(Path.Combine(root,rel.Replace('/',Path.DirectorySeparatorChar)));
  if(!dest.StartsWith(root+Path.DirectorySeparatorChar,StringComparison.OrdinalIgnoreCase))throw new IOException("Path escaped root");
  NoLinks(Path.GetDirectoryName(dest));
  if(File.Exists(dest)&&(File.GetAttributes(dest)&FileAttributes.ReparsePoint)!=0)throw new IOException("Linked target file");
  return dest;
 }
 static void State(string stage,string value) {File.WriteAllText(Path.Combine(stage,"state"),value);}
 static Process Launch(string root,string token) {
  var p=new ProcessStartInfo(Path.Combine(root,"myframe-desktop.exe"));p.WorkingDirectory=root;p.UseShellExecute=false;
  p.EnvironmentVariables.Remove("TENNOLEDGER_UPDATE_ACK");
  p.EnvironmentVariables.Remove("TENNOLEDGER_UPDATE_ROLLBACK");
  if(token!=null)p.EnvironmentVariables["TENNOLEDGER_UPDATE_ACK"]=token;
  else p.EnvironmentVariables["TENNOLEDGER_UPDATE_ROLLBACK"]="1";
  return Process.Start(p);
 }
 static void CheckTree(string dir) {
  NoLinks(dir);foreach(var item in Directory.GetFileSystemEntries(dir)){
   if((File.GetAttributes(item)&FileAttributes.ReparsePoint)!=0)throw new IOException("Linked update cache");
   if(Directory.Exists(item))CheckTree(item);
  }
 }
 static void CleanOldStages(string root,string current) {
  var cache=Path.Combine(root,".tennoledger-update");
  foreach(var dir in Directory.GetDirectories(cache))try {
   var full=Path.GetFullPath(dir);var token=Path.GetFileName(full);
   if(full==current||!full.StartsWith(cache+Path.DirectorySeparatorChar,StringComparison.OrdinalIgnoreCase)||token.Length<8||token.Any(c=>!Char.IsLetterOrDigit(c)&&c!='-'))continue;
   var state=File.ReadAllText(Path.Combine(full,"state"));if(state!="committed"&&state!="rolled-back")continue;
   CheckTree(full);Directory.Delete(full,true);
  }catch{}
 }
 static bool Rollback(Plan plan,string stage) {
  var failures=new List<string>();
  foreach(var e in (plan.remove??new Entry[0]).Reverse())try {
   var dest=Target(plan.root,e.path);var backup=Target(Path.Combine(stage,"backup"),e.path);
   var current=File.Exists(dest)?Hash(dest):null;if(current==e.before)continue;
   if(current!=null||!File.Exists(backup)||Hash(backup)!=e.before)throw new IOException("Removed file backup mismatch");
   Directory.CreateDirectory(Path.GetDirectoryName(dest));File.Copy(backup,dest,true);
  }catch(Exception ex){failures.Add(e.path+": "+ex.Message);}
  foreach(var e in plan.files.Reverse())try {
   var dest=Target(plan.root,e.path);var backup=Target(Path.Combine(stage,"backup"),e.path);
   var current=File.Exists(dest)?Hash(dest):null;
   if(current==e.before)continue;
   if(current!=e.sha256)throw new IOException("Installed file changed after update");
   if(e.before==null)File.Delete(dest);
   else {if(!File.Exists(backup)||Hash(backup)!=e.before)throw new IOException("Backup hash mismatch");File.Copy(backup,dest,true);}
  }catch(Exception ex){failures.Add(e.path+": "+ex.Message);}
  State(stage,failures.Count==0?"rolled-back":"rollback-failed");
  if(failures.Count>0)File.AppendAllText(Path.Combine(stage,"error.txt"),"\n"+String.Join("\n",failures));
  return failures.Count==0;
 }
 static int Main(string[] args) {
  string stage=null;Plan plan=null;bool trusted=false,locked=false,mutating=false;Process launched=null;FileStream guard=null;
  try {
   bool recover=args.Length==2&&args[1]=="--recover";
   if(args.Length!=1&&!recover)throw new IOException("Expected update stage");
   stage=Path.GetFullPath(args[0]);NoLinks(stage);
   plan=new JavaScriptSerializer().Deserialize<Plan>(File.ReadAllText(Path.Combine(stage,"plan.json")));
   var root=Path.GetFullPath(plan.root).TrimEnd(Path.DirectorySeparatorChar);
   if(plan.token.Length<8||plan.token.Any(c=>!Char.IsLetterOrDigit(c)&&c!='-'))throw new IOException("Invalid stage token");
   if(stage!=Path.Combine(root,".tennoledger-update",plan.token))throw new IOException("Stage escaped install directory");
   trusted=true;
   try {guard=new FileStream(Path.Combine(stage,"lock"),FileMode.OpenOrCreate,FileAccess.ReadWrite,FileShare.None);locked=true;}catch(IOException){return 2;}
   var unique=new HashSet<string>(StringComparer.OrdinalIgnoreCase);
   foreach(var e in plan.files) {if(!unique.Add(e.path))throw new IOException("Duplicate file");Target(root,e.path);}
   foreach(var e in plan.remove??new Entry[0]){if(!unique.Add(e.path))throw new IOException("Duplicate removed file");Target(root,e.path);}
   if(recover) {
    var state=File.ReadAllText(Path.Combine(stage,"state"));
    if(state=="committed"||state=="rolled-back")return 0;
    if(!Rollback(plan,stage))return 1;
    Launch(root,null);return 0;
   }
   foreach(var e in plan.files) {
    var dest=Target(root,e.path);var incoming=Target(Path.Combine(stage,"files"),e.path);
    if(!File.Exists(incoming)||new FileInfo(incoming).Length!=e.size||Hash(incoming)!=e.sha256)throw new IOException("Staged file verification failed");
    if((File.Exists(dest)?Hash(dest):null)!=e.before)throw new IOException("Installed files changed during download");
   }
   try {using(var parent=Process.GetProcessById(plan.parent)){if(!parent.WaitForExit(60000))throw new IOException("Application did not exit");}}catch(ArgumentException){}
   foreach(var e in plan.remove??new Entry[0]){if(Hash(Target(root,e.path))!=e.before)throw new IOException("Removed file changed during download");}
   State(stage,"applying");mutating=true;
   foreach(var e in plan.files) {
    var dest=Target(root,e.path);var incoming=Target(Path.Combine(stage,"files"),e.path);var backup=Target(Path.Combine(stage,"backup"),e.path);
    Directory.CreateDirectory(Path.GetDirectoryName(dest));Directory.CreateDirectory(Path.GetDirectoryName(backup));
    if(File.Exists(dest))File.Replace(incoming,dest,backup);else File.Move(incoming,dest);
   }
   foreach(var e in plan.remove??new Entry[0]){var dest=Target(root,e.path);var backup=Target(Path.Combine(stage,"backup"),e.path);Directory.CreateDirectory(Path.GetDirectoryName(backup));File.Move(dest,backup);}
   State(stage,"starting");launched=Launch(root,plan.token);
   var until=DateTime.UtcNow.AddSeconds(60);var ready=Path.Combine(stage,"ready");
   while(DateTime.UtcNow<until&&!File.Exists(ready)&&!launched.HasExited)Thread.Sleep(200);
   if(!File.Exists(ready))throw new IOException("Updated application did not confirm startup");
   State(stage,"committed");CleanOldStages(root,stage);
   // Update only the existing per-user registration for this exact install root.
   try {using(var key=Microsoft.Win32.Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Uninstall\TennoLedger",true)){
    if(key!=null&&String.Equals(Convert.ToString(key.GetValue("InstallLocation")).TrimEnd('\\'),root,StringComparison.OrdinalIgnoreCase)&&!String.IsNullOrEmpty(plan.version))key.SetValue("DisplayVersion",plan.version);
   }}catch(Exception e){File.WriteAllText(Path.Combine(stage,"metadata-error.txt"),e.Message);}
   return 0;
  } catch(Exception error) {
   try {
    if(launched!=null&&!launched.HasExited){launched.Kill();launched.WaitForExit(10000);}
    if(trusted&&locked) {
     File.WriteAllText(Path.Combine(stage,"error.txt"),error.Message);
     bool restored=!mutating||Rollback(plan,stage);
     if(!mutating)State(stage,"rolled-back");
     if(restored){bool alive=false;try{alive=!Process.GetProcessById(plan.parent).HasExited;}catch{}if(!alive)Launch(plan.root,null);}
    }
   }catch{}
   return 1;
  } finally {if(guard!=null)guard.Dispose();}
 }
}
